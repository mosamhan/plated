-- Plated — @mentions and image/sticker attachments on Plate/Plato comments.
-- Idempotent. Requires 0001_init.sql, 0002_platos.sql,
-- 0011_notification_triggers.sql (display_name), 0062_message_mentions.sql
-- (notifications_kind_check already allows 'mention').
--
-- Mentioning someone in a comment is deliberately scoped to people *you*
-- follow (mirrors DataContext's own `friendUsers` — mutual follow is already
-- a subset of who you follow, so "friends and people you're following" is
-- just "who you follow") — not the post's other commenters, and not an
-- app-wide search. The point of this feature is showing a friend a post
-- you like, not addressing another commenter: replying to a specific
-- comment (existing threading on Plato comments) already covers that case.
-- No push dispatch here (unlike message mentions' notify_and_push) — regular
-- comment notifications don't push today either (see 0011), so a comment
-- mention doesn't either, for consistency.

alter table public.comments add column if not exists image_url text;
alter table public.plato_comments add column if not exists image_url text;

create or replace function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  handles text[];
  recipients uuid[];
  commenter_name text;
begin
  select array_agg(distinct m[1]) into handles
  from regexp_matches(new.text, '@([a-zA-Z0-9_.]{2,30})', 'g') as m;
  if handles is null then
    return new;
  end if;

  select array_agg(distinct p.id) into recipients
  from public.profiles p
  join public.follows f on f.following_id = p.id and f.follower_id = new.user_id
  where p.handle = any(handles)
    and p.id <> new.user_id;

  if recipients is null then
    return new;
  end if;

  commenter_name := public.display_name(new.user_id);
  insert into public.notifications (user_id, kind, actor_id, order_id, text)
  select r, 'mention', new.user_id, new.order_id, commenter_name || ' mentioned you in a comment'
    from unnest(recipients) as r;
  return new;
end $$;

drop trigger if exists comments_notify_mentions on public.comments;
create trigger comments_notify_mentions after insert on public.comments
  for each row execute function public.notify_comment_mentions();

create or replace function public.notify_plato_comment_mentions()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  handles text[];
  recipients uuid[];
  commenter_name text;
begin
  select array_agg(distinct m[1]) into handles
  from regexp_matches(new.text, '@([a-zA-Z0-9_.]{2,30})', 'g') as m;
  if handles is null then
    return new;
  end if;

  select array_agg(distinct p.id) into recipients
  from public.profiles p
  join public.follows f on f.following_id = p.id and f.follower_id = new.user_id
  where p.handle = any(handles)
    and p.id <> new.user_id;

  if recipients is null then
    return new;
  end if;

  commenter_name := public.display_name(new.user_id);
  insert into public.notifications (user_id, kind, actor_id, plato_id, text)
  select r, 'mention', new.user_id, new.plato_id, commenter_name || ' mentioned you in a comment'
    from unnest(recipients) as r;
  return new;
end $$;

drop trigger if exists plato_comments_notify_mentions on public.plato_comments;
create trigger plato_comments_notify_mentions after insert on public.plato_comments
  for each row execute function public.notify_plato_comment_mentions();
