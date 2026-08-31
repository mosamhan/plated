-- Plated — emoji reactions on messages.
-- Idempotent. Requires 0019_messaging.sql.
--
-- One reaction per person per message: double-tapping hearts it, and picking a
-- different emoji from the long-press bar replaces it rather than stacking a
-- second one. That's the primary key doing the work — the client upserts and
-- the database enforces "one voice each".
--
-- Reads are scoped to the thread, not the reaction: you can see who reacted to
-- a message exactly when you can see the message itself.

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "reactions readable" on public.message_reactions;
drop policy if exists "react as self"     on public.message_reactions;
drop policy if exists "change own reaction" on public.message_reactions;
drop policy if exists "unreact as self"   on public.message_reactions;

-- Visible to everyone in the thread the message belongs to. `in_conversation`
-- is the SECURITY DEFINER helper from 0019 — see the recursion note there.
create policy "reactions readable" on public.message_reactions for select using (
  exists (
    select 1 from public.messages m
     where m.id = message_id and public.in_conversation(m.conversation_id, auth.uid())
  )
);

-- You may only ever write your own reaction, and only into a thread you're in.
create policy "react as self" on public.message_reactions for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.messages m
     where m.id = message_id and public.in_conversation(m.conversation_id, auth.uid())
  )
);
create policy "change own reaction" on public.message_reactions for update using (auth.uid() = user_id);
create policy "unreact as self"     on public.message_reactions for delete using (auth.uid() = user_id);

-- Reactions land while a thread is open, so they stream like messages do.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
