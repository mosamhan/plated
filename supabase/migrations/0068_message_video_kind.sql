-- Plated — allow 'video' as a message kind. Idempotent.
-- Requires 0057_restaurant_share.sql (the check constraint and
-- notify_new_message() body this replaces — confirmed matching the live
-- function via pg_get_functiondef before writing this, per CONTRIBUTING.md).
--
-- A video sent from the in-chat gallery picker is its own message kind,
-- distinct from 'image' — it needs a real video player (MessageBubble,
-- VideoViewerSheet) rather than an <Image>, and its upload path is different
-- (uploadVideo's fetch->ArrayBuffer route, not the base64 path photos use).

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'plate', 'plato', 'story_reply', 'voice', 'image', 'video', 'restaurant'));

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
    when 'video' then 'Sent a video'
    when 'restaurant' then 'Shared a restaurant'
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
