-- Plated — share a plate/Plato comment into a conversation as its own card.
-- Idempotent. Requires 0068_message_video_kind.sql (the check constraint and
-- notify_new_message() body this replaces — confirmed matching the live
-- function via pg_get_functiondef before writing this, per CONTRIBUTING.md).
--
-- A shared comment is denormalized onto the message itself (author + text, at
-- share time) rather than resolved live from the comments/plato_comments
-- tables the way a shared plate/Plato is resolved from orders/plato_videos.
-- Those are globally loaded client-side already, so a live lookup always
-- resolves; Plato comments specifically are loaded lazily per-Plato (only
-- once that Plato's own comments sheet has been opened), so the recipient of
-- a shared comment may never have fetched the thread it lives in at all.
-- Denormalizing also means the card still shows what the comment actually
-- said if it's edited or deleted afterward — the same "what was shared,
-- not what's live now" behavior a screenshot would have.

alter table public.messages add column if not exists comment_post_id uuid;
alter table public.messages add column if not exists comment_author_id uuid references public.profiles on delete set null;
alter table public.messages add column if not exists comment_text text;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'plate', 'plato', 'story_reply', 'voice', 'image', 'video', 'restaurant', 'plate_comment', 'plato_comment'));

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
    when 'plate_comment' then 'Shared a comment'
    when 'plato_comment' then 'Shared a comment'
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
