-- Plated — managing a conversation: mute, reply, forward, unsend, delete, voice.
-- Idempotent. Requires 0019_messaging.sql and 0021_message_reactions.sql.
--
-- Two kinds of deletion, and the difference is the point:
--
--   * **Delete for me** hides a message from one person (`message_hides`). It's
--     always allowed, to anyone, forever — it's housekeeping on your own copy.
--   * **Unsend** removes the row for everyone. Only the sender can do it, and
--     only inside a short window. That window is enforced by the DELETE policy,
--     not by hiding the button: "you can't take it back once they've read it"
--     is a promise to the recipient, and a promise the client can't keep alone.
--
-- The recipient can never unsend someone else's message — the policy is keyed
-- to `sender_id`, so there is no path to it.

-- ─────────────────────────────────────────────────────────────────────────────
-- MUTE — per participant, so muting is your decision about your inbox.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversation_participants
  add column if not exists muted boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- VOICE NOTES + REPLIES
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.messages
  -- Length of a voice note, so the bubble can size and label itself before the
  -- audio has loaded.
  add column if not exists duration_ms integer,
  -- The message this one answers. Self-referential; nulled rather than cascaded
  -- so unsending a quoted message doesn't take the reply with it.
  add column if not exists reply_to uuid references public.messages on delete set null;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'plate', 'plato', 'story_reply', 'voice'));

create index if not exists messages_reply_to_idx on public.messages (reply_to);

-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FOR ME — one row per person per message they've hidden.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.message_hides (
  message_id uuid not null references public.messages on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_hides enable row level security;

drop policy if exists "own hides readable" on public.message_hides;
drop policy if exists "hide as self"       on public.message_hides;
drop policy if exists "unhide as self"     on public.message_hides;

create policy "own hides readable" on public.message_hides for select using (auth.uid() = user_id);
create policy "hide as self"       on public.message_hides for insert with check (auth.uid() = user_id);
create policy "unhide as self"     on public.message_hides for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- POLICIES — reads skip what you've hidden; unsend is time-boxed to the sender.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "messages readable" on public.messages;
create policy "messages readable" on public.messages for select using (
  public.in_conversation(conversation_id, auth.uid())
  and not exists (
    select 1 from public.message_hides h
     where h.message_id = messages.id and h.user_id = auth.uid()
  )
);

-- Three minutes. Long enough to catch the message you regret the instant you
-- send it, short enough that it can't be used to rewrite a conversation later.
drop policy if exists "unsend message" on public.messages;
create policy "unsend message" on public.messages for delete using (
  auth.uid() = sender_id
  and created_at > now() - interval '3 minutes'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE — voice notes. Public-read like the other buckets; the URL is a
-- random path and the message carrying it is already behind conversation RLS.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('voice', 'voice', true)
  on conflict do nothing;

drop policy if exists "voice notes readable" on storage.objects;
drop policy if exists "upload own voice note" on storage.objects;

create policy "voice notes readable" on storage.objects for select using (bucket_id = 'voice');
create policy "upload own voice note" on storage.objects for insert
  with check (bucket_id = 'voice' and auth.uid()::text = (storage.foldername(name))[1]);
