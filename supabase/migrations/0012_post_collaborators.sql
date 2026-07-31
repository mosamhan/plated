-- Plated — collaborations on plates and Platos.
-- Idempotent. Requires 0001_init.sql, 0002_platos.sql, 0011_notification_triggers.sql.
--
-- A collaboration is *credit*, not a revenue split: creator earnings stay with
-- whoever made the original post, and any arrangement between the creators is
-- their own business, not the app's. Nothing here touches attribution or
-- payouts — it only records who else gets named on a post.
--
-- Consent is the point of the `status` column. A collaborator is `pending` until
-- they accept, and only accepted rows are publicly readable, so nobody's name
-- and face can be attached to a review they never agreed to. That matters more
-- here than in most apps: posts carry commission labels, and 16 CFR 465 makes
-- implying someone endorsed a monetized review a real problem.

create table if not exists public.post_collaborators (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one of these; a row is about a plate or a Plato, never both.
  order_id uuid references public.orders on delete cascade,
  plato_id uuid references public.plato_videos on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,     -- the collaborator
  invited_by uuid not null references public.profiles on delete cascade,  -- the post owner
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint one_target check ((order_id is null) <> (plato_id is null)),
  constraint no_self_collab check (user_id <> invited_by)
);

-- One invite per person per post, whichever kind of post it is.
create unique index if not exists post_collaborators_order_user_idx
  on public.post_collaborators (order_id, user_id) where order_id is not null;
create unique index if not exists post_collaborators_plato_user_idx
  on public.post_collaborators (plato_id, user_id) where plato_id is not null;
-- "What am I being asked to join?"
create index if not exists post_collaborators_user_status_idx
  on public.post_collaborators (user_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Ownership — used by the RLS insert policy below.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.owns_post(in_order uuid, in_plato uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select case
    when in_order is not null then exists (
      select 1 from public.orders where id = in_order and user_id = auth.uid())
    else exists (
      select 1 from public.plato_videos where id = in_plato and user_id = auth.uid())
  end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
--   • accepted rows are public (they're rendered on the post)
--   • a pending/declined row is visible only to the two people involved
--   • only the post's owner can invite
--   • only the invitee can accept or decline, and can't rewrite who/what it's for
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.post_collaborators enable row level security;

drop policy if exists "collabs readable"    on public.post_collaborators;
drop policy if exists "owner invites"       on public.post_collaborators;
drop policy if exists "invitee responds"    on public.post_collaborators;

create policy "collabs readable" on public.post_collaborators for select
  using (status = 'accepted' or auth.uid() = user_id or auth.uid() = invited_by);

create policy "owner invites" on public.post_collaborators for insert
  with check (
    auth.uid() = invited_by
    and status = 'pending'
    and public.owns_post(order_id, plato_id)
  );

create policy "invitee responds" on public.post_collaborators for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications. 'collab' is a new kind, so the existing check constraint has to
-- be widened before anything can insert one.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like', 'comment', 'follow', 'reorder', 'earnings', 'milestone', 'collab'));

/* Invited → tell the collaborator. Accepted → tell the owner. A decline is
   deliberately silent: nobody needs a notification telling them they were
   turned down. */
create or replace function public.notify_collab()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  dish text;
  kind_label text;
begin
  if new.order_id is not null then
    select dish_name into dish from public.orders where id = new.order_id;
    kind_label := 'plate';
  else
    select dish_name into dish from public.plato_videos where id = new.plato_id;
    kind_label := 'Plato';
  end if;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, actor_id, order_id, plato_id, text)
         values (new.user_id, 'collab', new.invited_by, new.order_id, new.plato_id,
                 public.display_name(new.invited_by) || ' invited you to collaborate on their '
                 || kind_label || ' of the ' || dish);
    return new;
  end if;

  if new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.notifications (user_id, kind, actor_id, order_id, plato_id, text)
         values (new.invited_by, 'collab', new.user_id, new.order_id, new.plato_id,
                 public.display_name(new.user_id) || ' is now a collaborator on your '
                 || kind_label || ' of the ' || dish);
  end if;
  return new;
end $$;

drop trigger if exists post_collaborators_notify on public.post_collaborators;
create trigger post_collaborators_notify
  after insert or update on public.post_collaborators
  for each row execute function public.notify_collab();

-- Responding stamps the time, so it can't be back-dated by the client.
create or replace function public.stamp_collab_response()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status <> old.status then
    new.responded_at := now();
  end if;
  -- The invitee may only move the status; everything else is fixed at invite time.
  new.order_id := old.order_id;
  new.plato_id := old.plato_id;
  new.user_id := old.user_id;
  new.invited_by := old.invited_by;
  return new;
end $$;

drop trigger if exists post_collaborators_stamp on public.post_collaborators;
create trigger post_collaborators_stamp
  before update on public.post_collaborators
  for each row execute function public.stamp_collab_response();
