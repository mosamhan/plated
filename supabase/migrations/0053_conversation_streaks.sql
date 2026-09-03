-- Plated — per-conversation "chat streaks" (flame + day count), for 1:1s and
-- groups alike. Mirrors check_ins' shape (0010_check_ins.sql) one level
-- lower: one row per (conversation, user, day) instead of per (user, day).
--
-- Unified rule, no isGroup branching anywhere: a day "counts" toward the
-- streak when at least 2 distinct people posted in that conversation that
-- day. For a 1:1 (exactly 2 participants) that's just "both people messaged
-- today"; for a group it's literally "at least 2 members" — one predicate
-- covers both. The client (src/lib/conversationStreak.ts) does the "at least
-- 2 distinct senders" grouping and the day-walk; this table only records raw
-- (conversation, user, day) activity.
create table if not exists public.conversation_activity_days (
  conversation_id uuid not null references public.conversations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  day date not null,
  primary key (conversation_id, user_id, day)
);

create index if not exists conversation_activity_days_conv_day_idx
  on public.conversation_activity_days (conversation_id, day desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Recorded alongside touch_conversation/notify_new_message as a third,
-- independent `after insert on messages` trigger — one trigger per concern,
-- same convention as those two, rather than folding this bookkeeping into
-- either.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_conversation_activity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.conversation_activity_days (conversation_id, user_id, day)
       values (new.conversation_id, new.sender_id, (new.created_at at time zone 'utc')::date)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists messages_record_activity on public.messages;
create trigger messages_record_activity
  after insert on public.messages
  for each row execute function public.record_conversation_activity();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — only the conversation's own participants can read its activity.
-- Nobody writes directly: inserts go through the trigger above.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversation_activity_days enable row level security;

drop policy if exists "participants see conversation activity" on public.conversation_activity_days;
create policy "participants see conversation activity" on public.conversation_activity_days
  for select using (public.in_conversation(conversation_id, auth.uid()));
