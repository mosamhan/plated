-- Plated — group chat upgrade: atomic group creation (fixes "Could not create
-- group"), pin/mark-unread state, group photo, plain photo messages, and
-- owner-removes-member.
-- Idempotent. Requires 0019_messaging.sql, 0022_message_management.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- ATOMIC GROUP CREATION
--
-- The client used to do this as two separate inserts (conversations, then a
-- batch conversation_participants insert), each independently subject to RLS.
-- The participants insert's own policy checks `exists (select 1 from
-- conversations c where c.id = conversation_id and c.created_by = auth.uid())`
-- — a plain (non-definer) subquery against `conversations`, which is itself
-- gated by `in_conversation()`, which requires the caller to already be a
-- participant. At group-creation time that's not yet true for every row in
-- the batch, so the insert could fail on RLS timing alone, indistinguishably
-- from a real refusal (e.g. the block-check trigger below). Doing both inserts
-- in one SECURITY DEFINER transaction — same pattern as start_direct_conversation
-- already uses for 1:1 — sidesteps the RLS race entirely; the block-check
-- trigger still fires normally, since triggers aren't RLS.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_group_conversation(participant_ids uuid[], p_title text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  conv uuid;
  others uuid[];
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  -- De-dupe and drop the caller if they were included — the caller's own row
  -- is always added below, regardless of what the client sent.
  select array_agg(distinct u) into others
    from unnest(participant_ids) u
   where u is not null and u <> me;
  if others is null or array_length(others, 1) < 1 then
    raise exception 'a group needs at least one other person';
  end if;

  insert into public.conversations (is_group, title, created_by)
  values (true, p_title, me)
  returning id into conv;

  insert into public.conversation_participants (conversation_id, user_id)
  select conv, u from unnest(array_append(others, me)) u;

  return conv;
end $$;

revoke all on function public.create_group_conversation(uuid[], text) from public;
grant execute on function public.create_group_conversation(uuid[], text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PIN + MANUAL MARK-AS-UNREAD — per participant, same posture as `muted`.
-- `forced_unread` is deliberately separate from `last_read_at` rather than a
-- back-dating trick against it: `last_read_at` is a real read-receipt
-- timestamp used elsewhere, and corrupting it to fake "unread" would break
-- that. This flag is cleared the moment the thread is actually opened again
-- (same place `last_read_at` already gets bumped, client-side).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversation_participants
  add column if not exists pinned boolean not null default false,
  add column if not exists forced_unread boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- GROUP PHOTO
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversations
  add column if not exists avatar_url text;

-- ─────────────────────────────────────────────────────────────────────────────
-- PLAIN PHOTO MESSAGES — a real image/video sent in a chat, distinct from a
-- `plate`/`plato` share (those are Plated-content cards, not a raw upload).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'plate', 'plato', 'story_reply', 'voice', 'image'));

insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', true)
  on conflict do nothing;

drop policy if exists "chat media readable" on storage.objects;
drop policy if exists "upload own chat media" on storage.objects;

create policy "chat media readable" on storage.objects for select using (bucket_id = 'chat-media');
create policy "upload own chat media" on storage.objects for insert
  with check (bucket_id = 'chat-media' and auth.uid()::text = (storage.foldername(name))[1]);

-- Push-notification preview text needs the new kind too (0025_push_notifications.sql).
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
    when 'image' then 'Sent a photo'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- OWNER REMOVES A MEMBER — additive alongside the existing self-leave delete
-- policy (0019's "leave conversation"). Only the conversation's creator may
-- delete someone ELSE's participant row; removing your own row is already
-- covered by the existing policy.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "owner removes member" on public.conversation_participants;
create policy "owner removes member" on public.conversation_participants for delete using (
  exists (
    select 1 from public.conversations c
     where c.id = conversation_participants.conversation_id and c.created_by = auth.uid()
  )
);
