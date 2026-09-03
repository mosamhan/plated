-- Plated — @mentions inside a thread. Idempotent. Requires
-- 0025_push_notifications.sql (notify_and_push, display_name) and
-- 0019_messaging.sql (conversation_participants).
--
-- No new mentions table: a message's mentions are re-derived by regex at
-- send time, both here (to decide who to notify) and on the client (to
-- highlight the @handle span) — the same parse, run twice, rather than a
-- join table to keep in sync across edits. Thread membership is the actual
-- privacy boundary (you can only mention someone already in the private
-- thread you're both in); the one thing this still checks is the "mentions
-- off" case from profiles.tag_audience (settings/tags.tsx) — full
-- follower/friend-graph enforcement is a bigger feature with no existing SQL
-- helper to build on, and adds little here since sharing the thread already
-- implies a relationship.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like','comment','follow','reorder','earnings','milestone','collab','message','reaction','mention'));

create or replace function public.notify_message_mentions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  handles text[];
  recipients uuid[];
  sender_name text;
begin
  select array_agg(distinct m[1]) into handles
  from regexp_matches(new.text, '@([a-zA-Z0-9_.]{2,30})', 'g') as m;
  if handles is null then
    return new;
  end if;

  select array_agg(distinct p.id) into recipients
  from public.profiles p
  join public.conversation_participants cp
    on cp.user_id = p.id
   and cp.conversation_id = new.conversation_id
   and cp.state = 'accepted'
  where p.handle = any(handles)
    and p.id <> new.sender_id
    and p.tag_audience <> 'off';

  if recipients is null then
    return new;
  end if;

  sender_name := public.display_name(new.sender_id);
  perform public.notify_and_push(
    recipients,
    new.sender_id,
    'mention',
    sender_name,
    sender_name || ' mentioned you: ' || left(new.text, 120),
    jsonb_build_object('type', 'mention', 'conversationId', new.conversation_id)
  );
  return new;
end $$;

-- Separate trigger from notify_new_message (0025/0049/0057), not a
-- replacement — both fire on the same insert. One broadcasts to the whole
-- thread, this one notifies only whoever was actually @mentioned.
drop trigger if exists messages_notify_mentions on public.messages;
create trigger messages_notify_mentions
  after insert on public.messages
  for each row execute function public.notify_message_mentions();
