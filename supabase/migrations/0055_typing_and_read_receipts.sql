-- Plated — read receipts + typing indicator.
--
-- Read receipts need nothing new: `conversation_participants.last_read_at`
-- (0019) already tells you the moment everyone last opened the thread. The
-- only gap is that the client never hears about it changing for anyone but
-- itself — it streams `messages` and `message_reactions` live (0019, 0021)
-- but never subscribed to this table, so someone else's read receipt only
-- ever showed up on your next full reload. This closes that gap the same
-- way those two did.
--
-- Typing is intentionally NOT here — it's Realtime Presence on an ephemeral
-- per-conversation channel, not a database row. Nobody needs a permanent
-- record that you typed and didn't send, and presence already clears itself
-- the moment a client disconnects, which a table row never does on its own.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'conversation_participants'
  ) then
    alter publication supabase_realtime add table public.conversation_participants;
  end if;
end $$;
