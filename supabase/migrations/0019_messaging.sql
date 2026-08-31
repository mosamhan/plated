-- Plated — direct messages: 1:1 threads, group chats, message requests.
-- Idempotent. Requires 0001_init.sql (profiles, follows, blocks).
--
-- Shape: a `conversation` has N `conversation_participants` and N `messages`.
-- 1:1 and group are the same thing with `is_group` telling the UI how to title
-- and render it, rather than two parallel schemas that drift.
--
-- Two real boundaries live here rather than in the client:
--
--   * Who can read a thread — only its participants, enforced by RLS on every
--     one of the three tables.
--   * Who can start one — a profile set to `friends` only accepts threads from
--     mutual follows; anyone else lands in that person's Requests instead of
--     their inbox. Blocks are a hard wall in both directions.
--
-- Recursion note: the "am I in this conversation?" test is a SECURITY DEFINER
-- function, not an inline `exists` against conversation_participants. A policy
-- on conversation_participants that queries conversation_participants recurses
-- and Postgres aborts the query; the definer function reads past RLS once and
-- ends it.

-- ─────────────────────────────────────────────────────────────────────────────
-- WHO CAN MESSAGE YOU  (per-profile setting; default stays open)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists message_privacy text not null default 'everyone'
    check (message_privacy in ('everyone', 'friends'));

-- ─────────────────────────────────────────────────────────────────────────────
-- CONVERSATIONS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  -- Groups can be named; 1:1 threads are titled from the other person.
  title text,
  created_by uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  -- Denormalised so the inbox can sort without reading every thread's messages.
  last_message_at timestamptz not null default now()
);
create index if not exists conversations_last_message_at_idx
  on public.conversations (last_message_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTICIPANTS
-- `state` is per-participant, not per-conversation: the person who starts a
-- thread has always accepted it; only the recipient's row can sit in 'request'.
-- `last_read_at` drives unread counts (messages newer than it, not yours).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  state text not null default 'accepted' check (state in ('accepted', 'request')),
  last_read_at timestamptz not null default 'epoch',
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- MESSAGES
-- `attachment_id` is a bare uuid rather than an FK because it points at one of
-- three tables depending on `kind` (a plate, a Plato, or the story being
-- replied to) — same polymorphic pattern as collection_items in 0005.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id uuid not null references public.profiles on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'plate', 'plato', 'story_reply')),
  text text not null default '',
  attachment_id uuid,
  -- Which plate of a multi-plate post was shared. A post is several plates now
  -- (0014), and "you have to try this" is about one of them — without this the
  -- card in the thread would always show the headline dish whatever the sender
  -- had swiped to. Null/0 means the first plate.
  attachment_index integer,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPERS
-- ─────────────────────────────────────────────────────────────────────────────

/* Membership test used by every policy below. SECURITY DEFINER on purpose —
   see the recursion note at the top of this file. */
create or replace function public.in_conversation(conv uuid, uid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants p
     where p.conversation_id = conv and p.user_id = uid
  )
$$;

/* Mutual follow — the same "friends" rule 0016/0017 spell out inline for post
   visibility, named once here because the messaging gate needs it repeatedly. */
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.follows f where f.follower_id = a and f.following_id = b)
     and exists (select 1 from public.follows f where f.follower_id = b and f.following_id = a)
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversations              enable row level security;
alter table public.conversation_participants  enable row level security;
alter table public.messages                   enable row level security;

drop policy if exists "conversations readable"   on public.conversations;
drop policy if exists "start conversation"       on public.conversations;
drop policy if exists "update own conversation"  on public.conversations;

create policy "conversations readable" on public.conversations for select using (
  public.in_conversation(id, auth.uid())
);
create policy "start conversation" on public.conversations for insert with check (
  auth.uid() = created_by
);
-- Renaming a group is open to its members; last_message_at is moved by a
-- trigger, not by the client.
create policy "update own conversation" on public.conversations for update using (
  public.in_conversation(id, auth.uid())
);

drop policy if exists "participants readable"  on public.conversation_participants;
drop policy if exists "add participant"        on public.conversation_participants;
drop policy if exists "update own membership"  on public.conversation_participants;
drop policy if exists "leave conversation"     on public.conversation_participants;

-- You can see everyone in a thread you're in — that's the thread's member list.
create policy "participants readable" on public.conversation_participants for select using (
  public.in_conversation(conversation_id, auth.uid())
);
-- The person who started a thread fills it; anyone can add their own row (so a
-- group invite you accept is your write, not someone else's).
create policy "add participant" on public.conversation_participants for insert with check (
  auth.uid() = user_id
  or exists (
    select 1 from public.conversations c
     where c.id = conversation_id and c.created_by = auth.uid()
  )
);
-- Marking read and accepting a request are both edits to your own row only.
create policy "update own membership" on public.conversation_participants for update using (
  auth.uid() = user_id
);
create policy "leave conversation" on public.conversation_participants for delete using (
  auth.uid() = user_id
);

drop policy if exists "messages readable" on public.messages;
drop policy if exists "send message"      on public.messages;
drop policy if exists "unsend message"    on public.messages;

create policy "messages readable" on public.messages for select using (
  public.in_conversation(conversation_id, auth.uid())
);
-- Both halves matter: you must be the sender *and* be in the thread.
create policy "send message" on public.messages for insert with check (
  auth.uid() = sender_id and public.in_conversation(conversation_id, auth.uid())
);
create policy "unsend message" on public.messages for delete using (
  auth.uid() = sender_id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- GATE — blocks and the friends-only setting, applied as the row is written.
-- Client code can't opt out of this: it rewrites `state` regardless of what was
-- sent, and refuses the insert outright across a block.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.gate_conversation_participant()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  starter uuid;
  privacy text;
begin
  select c.created_by into starter from public.conversations c where c.id = new.conversation_id;

  -- The starter's own membership is never a request.
  if starter is null or new.user_id = starter then
    new.state := 'accepted';
    return new;
  end if;

  if exists (
    select 1 from public.blocks b
     where (b.blocker_id = new.user_id and b.blocked_id = starter)
        or (b.blocker_id = starter and b.blocked_id = new.user_id)
  ) then
    raise exception 'cannot start a conversation with this person';
  end if;

  select coalesce(message_privacy, 'everyone') into privacy
    from public.profiles where id = new.user_id;

  if privacy = 'friends' and not public.are_friends(starter, new.user_id) then
    new.state := 'request';
  else
    new.state := 'accepted';
  end if;
  return new;
end $$;

drop trigger if exists gate_participant on public.conversation_participants;
create trigger gate_participant
  before insert on public.conversation_participants
  for each row execute function public.gate_conversation_participant();

-- ─────────────────────────────────────────────────────────────────────────────
-- Keep the inbox sort key fresh. Definer because the sender is updating a row
-- on `conversations` that the update policy would otherwise re-check per write.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ─────────────────────────────────────────────────────────────────────────────
-- FIND-OR-CREATE a 1:1 thread. One round trip, and no race where two taps on
-- "Message" leave the same pair holding two different threads.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.start_direct_conversation(other uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null or other is null or me = other then
    raise exception 'invalid participants';
  end if;

  select c.id into conv
    from public.conversations c
    join public.conversation_participants a
      on a.conversation_id = c.id and a.user_id = me
    join public.conversation_participants b
      on b.conversation_id = c.id and b.user_id = other
   where c.is_group = false
   order by c.last_message_at desc
   limit 1;
  if conv is not null then
    return conv;
  end if;

  insert into public.conversations (is_group, created_by) values (false, me)
    returning id into conv;
  -- gate_participant decides whether `other` lands accepted or in Requests.
  insert into public.conversation_participants (conversation_id, user_id)
    values (conv, me), (conv, other);
  return conv;
end $$;

revoke all on function public.start_direct_conversation(uuid) from public;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME — messages stream to open threads. Guarded because adding a table
-- that's already in the publication is an error, not a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
