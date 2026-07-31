-- Plated — generate notifications from the interactions that cause them.
-- Idempotent. Requires 0001_init.sql and 0002_platos.sql.
--
-- Until now `notifications` was only ever written by hand, so a real account saw
-- an empty screen no matter how much happened. These triggers fill it: a like, a
-- comment, a follow or a reorder writes the row as part of the same statement.
--
-- Deliberately in the database rather than the client: the person being notified
-- isn't the one taking the action, and no RLS policy should let a client insert
-- rows onto someone else's timeline. Each function is `security definer` for
-- exactly that reason — the trigger writes, the client never does.

-- Platos need somewhere to point. Notifications about a reel previously had to
-- fall back to the actor's profile.
alter table public.notifications
  add column if not exists plato_id uuid references public.plato_videos on delete cascade;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────────

/* Display name for notification copy. Falls back to the handle so a profile
   with a blank name still reads sensibly. */
create or replace function public.display_name(uid uuid)
returns text
language sql stable
security definer set search_path = public
as $$
  select coalesce(nullif(trim(name), ''), '@' || handle, 'Someone')
    from public.profiles where id = uid
$$;

/* True when this exact notification already went out recently.
   Unlike/re-like and unfollow/refollow are one thought, not two — without this
   they'd each add another row every time someone fidgets with a button. */
create or replace function public.notified_recently(
  recipient uuid, in_kind text, actor uuid, in_order uuid, in_plato uuid
) returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.notifications
     where user_id = recipient
       and kind = in_kind
       and actor_id is not distinct from actor
       and order_id is not distinct from in_order
       and plato_id is not distinct from in_plato
       and created_at > now() - interval '1 day'
  )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Plates: like · comment · reorder
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_order_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recipient uuid;
  dish text;
  kind text;
  copy text;
begin
  select o.user_id, o.dish_name into recipient, dish
    from public.orders o where o.id = new.order_id;

  -- Nobody needs telling about their own activity.
  if recipient is null or recipient = new.user_id then
    return new;
  end if;

  kind := tg_argv[0];

  -- Branches, not a CASE expression: `new.text` only exists on comments, and
  -- PL/pgSQL resolves every field named in an expression even in the arms it
  -- won't take — a CASE here fails outright on likes and reorders.
  if kind = 'comment' then
    copy := public.display_name(new.user_id) || ' commented: "' ||
            left(new.text, 60) || case when length(new.text) > 60 then '…' else '' end || '"';
  else
    -- Each comment is its own event; a like or reorder de-dupes.
    if public.notified_recently(recipient, kind, new.user_id, new.order_id, null) then
      return new;
    end if;
    if kind = 'like' then
      copy := public.display_name(new.user_id) || ' liked your ' || dish;
    else
      copy := public.display_name(new.user_id) || ' reordered your ' || dish;
    end if;
  end if;

  insert into public.notifications (user_id, kind, actor_id, order_id, text)
       values (recipient, kind, new.user_id, new.order_id, copy);
  return new;
end $$;

drop trigger if exists likes_notify on public.likes;
create trigger likes_notify after insert on public.likes
  for each row execute function public.notify_order_event('like');

drop trigger if exists reorders_notify on public.reorders;
create trigger reorders_notify after insert on public.reorders
  for each row execute function public.notify_order_event('reorder');

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_order_event('comment');

-- ─────────────────────────────────────────────────────────────────────────────
-- Platos: like · comment
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_plato_event()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  recipient uuid;
  dish text;
  kind text;
  copy text;
begin
  select v.user_id, v.dish_name into recipient, dish
    from public.plato_videos v where v.id = new.plato_id;

  if recipient is null or recipient = new.user_id then
    return new;
  end if;

  kind := tg_argv[0];

  -- Same reason as notify_order_event: plato_likes has no `text` column, so the
  -- comment copy has to live in its own branch.
  if kind = 'comment' then
    copy := public.display_name(new.user_id) || ' commented on your Plato: "' ||
            left(new.text, 60) || case when length(new.text) > 60 then '…' else '' end || '"';
  else
    if public.notified_recently(recipient, kind, new.user_id, null, new.plato_id) then
      return new;
    end if;
    copy := public.display_name(new.user_id) || ' liked your Plato of the ' || dish;
  end if;

  insert into public.notifications (user_id, kind, actor_id, plato_id, text)
       values (recipient, kind, new.user_id, new.plato_id, copy);
  return new;
end $$;

drop trigger if exists plato_likes_notify on public.plato_likes;
create trigger plato_likes_notify after insert on public.plato_likes
  for each row execute function public.notify_plato_event('like');

drop trigger if exists plato_comments_notify on public.plato_comments;
create trigger plato_comments_notify after insert on public.plato_comments
  for each row execute function public.notify_plato_event('comment');

-- ─────────────────────────────────────────────────────────────────────────────
-- Follows
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_follow()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.notified_recently(new.following_id, 'follow', new.follower_id, null, null) then
    return new;
  end if;
  insert into public.notifications (user_id, kind, actor_id, text)
       values (new.following_id, 'follow', new.follower_id,
               public.display_name(new.follower_id) || ' started following you');
  return new;
end $$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_follow();
