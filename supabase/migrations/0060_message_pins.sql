-- Plated — pinning one message inside a thread. Idempotent. Requires
-- 0019_messaging.sql (public.in_conversation, conversations, messages).
--
-- One pin per conversation, not a list — a single row keyed on
-- `conversation_id` that a new pin simply replaces (upsert), same "the
-- simple default" call most chat apps make before ever supporting several.
-- Separate table rather than a column on `conversations` because it needs
-- its own `pinned_by`/`created_at` and its own RLS shape (any member can
-- pin/unpin, not just the conversation's own creator).

create table if not exists public.message_pins (
  conversation_id uuid primary key references public.conversations on delete cascade,
  message_id uuid not null references public.messages on delete cascade,
  pinned_by uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.message_pins enable row level security;

drop policy if exists "pins readable by members" on public.message_pins;
create policy "pins readable by members" on public.message_pins for select
  using (public.in_conversation(conversation_id, auth.uid()));

drop policy if exists "members can pin" on public.message_pins;
create policy "members can pin" on public.message_pins for insert
  with check (public.in_conversation(conversation_id, auth.uid()) and pinned_by = auth.uid());

-- Lets "pin a different message" be a single upsert rather than delete+insert.
drop policy if exists "members can repin" on public.message_pins;
create policy "members can repin" on public.message_pins for update
  using (public.in_conversation(conversation_id, auth.uid()))
  with check (public.in_conversation(conversation_id, auth.uid()) and pinned_by = auth.uid());

drop policy if exists "members can unpin" on public.message_pins;
create policy "members can unpin" on public.message_pins for delete
  using (public.in_conversation(conversation_id, auth.uid()));

-- So the pin banner updates live for everyone in the thread, the same way
-- messages/reactions/read-receipts already do (0019, 0021, 0055).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'message_pins'
  ) then
    alter publication supabase_realtime add table public.message_pins;
  end if;
end $$;
