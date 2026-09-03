-- Plated — editing a sent message. Idempotent. Requires 0022_message_management.sql.
--
-- Mirrors unsend's shape exactly (0022): a time-boxed policy is the actual
-- enforcement, the client button is just UX. Unsend gets 3 minutes because
-- taking a message back entirely is a bigger promise; editing only needs to
-- be long enough to catch a typo, not so long it can rewrite an old
-- conversation, so it gets a longer but still bounded window.

alter table public.messages add column if not exists edited_at timestamptz;

drop policy if exists "edit own message" on public.messages;
create policy "edit own message" on public.messages for update
  using (auth.uid() = sender_id and created_at > now() - interval '15 minutes')
  with check (auth.uid() = sender_id);
