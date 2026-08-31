-- Plated — push notifications for messages and reactions.
-- Idempotent. Requires 0019_messaging.sql and 0021_message_reactions.sql.
--
-- The chain is: a row lands in `messages` (or `message_reactions`) → a trigger
-- writes the in-app `notifications` row and asks `pg_net` to POST the recipient
-- list to the `push` Edge Function → that function talks to Expo's push API.
--
-- Why a trigger and not the sending client:
--   * The client that sends a message must not be trusted to also decide who
--     gets woken up — that's an obvious way to spam someone's lock screen.
--   * The sender's app can be backgrounded the instant they hit send, so any
--     client-side "now notify them" is a race it will sometimes lose.
--
-- Muted conversations are honoured here, at the source, so a muted thread never
-- generates a push at all rather than being filtered on the device.

create extension if not exists pg_net with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- DEVICE TOKENS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  platform text not null default 'ios' check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "own tokens readable" on public.push_tokens;
drop policy if exists "register own token"  on public.push_tokens;
drop policy if exists "update own token"    on public.push_tokens;
drop policy if exists "remove own token"    on public.push_tokens;

create policy "own tokens readable" on public.push_tokens for select using (auth.uid() = user_id);
create policy "register own token"  on public.push_tokens for insert with check (auth.uid() = user_id);
create policy "update own token"    on public.push_tokens for update using (auth.uid() = user_id);
create policy "remove own token"    on public.push_tokens for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- WHERE TO SEND
-- The function URL and service key live in a private settings table rather than
-- being hardcoded, so this migration is safe to read and the key never appears
-- in the SQL. Populate it once (see MIGRATE.md); until then the triggers still
-- write in-app notifications and simply skip the push.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.push_config (
  id boolean primary key default true check (id),
  function_url text,
  service_key text
);
alter table public.push_config enable row level security;
-- No policies at all: nothing but SECURITY DEFINER functions may read this.

-- ─────────────────────────────────────────────────────────────────────────────
-- The notifications table needs to admit these two new kinds.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like','comment','follow','reorder','earnings','milestone','collab','message','reaction'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Fan-out helper: write the in-app row, then fire the push.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_and_push(
  recipients uuid[], actor uuid, in_kind text, in_title text, in_body text, in_data jsonb
) returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  cfg record;
  tokens text[];
begin
  if recipients is null or array_length(recipients, 1) is null then
    return;
  end if;

  -- In-app record first: this is the part that must work even with no push
  -- configured, and it's what the Notifications screen reads.
  insert into public.notifications (user_id, kind, actor_id, text)
  select r, in_kind, actor, in_body from unnest(recipients) as r;

  select * into cfg from public.push_config where id;
  if cfg.function_url is null or cfg.service_key is null then
    return;
  end if;

  select array_agg(t.token) into tokens
    from public.push_tokens t
   where t.user_id = any(recipients);

  if tokens is null then
    return;
  end if;

  perform extensions.net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_key
    ),
    body := jsonb_build_object('tokens', tokens, 'title', in_title, 'body', in_body, 'data', in_data)
  );
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- New message → everyone else in the thread who hasn't muted it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recipients uuid[];
  sender_name text;
  preview text;
begin
  select array_agg(p.user_id) into recipients
    from public.conversation_participants p
   where p.conversation_id = new.conversation_id
     and p.user_id <> new.sender_id
     and p.muted = false
     -- A request you haven't accepted shouldn't be able to buzz your phone.
     and p.state = 'accepted';

  if recipients is null then
    return new;
  end if;

  sender_name := public.display_name(new.sender_id);
  preview := case new.kind
    when 'plate' then 'Shared a plate'
    when 'plato' then 'Shared a Plato'
    when 'voice' then 'Sent a voice message'
    when 'story_reply' then 'Replied to your story'
    else left(new.text, 120)
  end;

  perform public.notify_and_push(
    recipients,
    new.sender_id,
    'message',
    sender_name,
    preview,
    jsonb_build_object('type', 'message', 'conversationId', new.conversation_id)
  );
  return new;
end $$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_new_message();

-- ─────────────────────────────────────────────────────────────────────────────
-- Reaction → the message's sender (never yourself).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_message_reaction()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recipient uuid;
  conv uuid;
  muted boolean;
begin
  select m.sender_id, m.conversation_id into recipient, conv
    from public.messages m where m.id = new.message_id;

  if recipient is null or recipient = new.user_id then
    return new;
  end if;

  select p.muted into muted
    from public.conversation_participants p
   where p.conversation_id = conv and p.user_id = recipient;
  if coalesce(muted, false) then
    return new;
  end if;

  perform public.notify_and_push(
    array[recipient],
    new.user_id,
    'reaction',
    public.display_name(new.user_id),
    new.emoji || ' reacted to your message',
    jsonb_build_object('type', 'reaction', 'conversationId', conv)
  );
  return new;
end $$;

drop trigger if exists reactions_notify on public.message_reactions;
create trigger reactions_notify after insert on public.message_reactions
  for each row execute function public.notify_message_reaction();
