-- Plated — whether a specific plate/Plato earns creator commission.
-- Idempotent. Requires 0036_restaurant_verified_flag.sql, 0037_restaurant_creator_blocks.sql.
--
-- Computed once, at creation time, by a trigger — never asserted by the
-- client (same posture as everything else trust-sensitive in this schema).
-- Locking it in at creation rather than re-deriving it live means a
-- restaurant losing its subscription later doesn't retroactively strip
-- commission from a creator's already-posted content, and a rate change
-- (which requires the manual approval path in 0035) can't be applied
-- backdated to posts made under the old rate.
--
-- Eligible only if, at the moment of posting: the tagged restaurant is
-- verified (0036), the poster is a qualified Plated Creator
-- (`profiles.compensation_eligible` — see the "Become a Plated Creator"
-- criteria, set server-side), and the restaurant hasn't blocked them (0037).

alter table public.orders
  add column if not exists monetizable boolean not null default false,
  add column if not exists commission_percent_snapshot numeric(4,1);

alter table public.plato_videos
  add column if not exists monetizable boolean not null default false,
  add column if not exists commission_percent_snapshot numeric(4,1);

create or replace function public.compute_post_monetization(p_user_id uuid, p_restaurant_id uuid)
returns table (monetizable boolean, commission_percent_snapshot numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_eligible boolean;
  v_restaurant_verified boolean;
  v_blocked boolean;
  v_rate numeric;
begin
  if p_restaurant_id is null then
    return query select false, null::numeric;
    return;
  end if;

  select p.compensation_eligible into v_creator_eligible from public.profiles p where p.id = p_user_id;
  select r.verified into v_restaurant_verified from public.restaurants r where r.id = p_restaurant_id;
  select exists(
    select 1 from public.restaurant_creator_blocks b
    where b.restaurant_id = p_restaurant_id and b.creator_id = p_user_id
  ) into v_blocked;

  if coalesce(v_creator_eligible, false) and coalesce(v_restaurant_verified, false) and not coalesce(v_blocked, false) then
    select s.commission_percent into v_rate
    from public.restaurant_subscriptions s
    where s.restaurant_id = p_restaurant_id and s.status = 'active';
    return query select true, v_rate;
  else
    return query select false, null::numeric;
  end if;
end;
$$;

create or replace function public.trg_set_order_monetization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result record;
begin
  select * into v_result from public.compute_post_monetization(new.user_id, new.restaurant_id);
  new.monetizable := v_result.monetizable;
  new.commission_percent_snapshot := v_result.commission_percent_snapshot;
  return new;
end;
$$;

create or replace function public.trg_set_plato_monetization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result record;
begin
  select * into v_result from public.compute_post_monetization(new.user_id, new.restaurant_id);
  new.monetizable := v_result.monetizable;
  new.commission_percent_snapshot := v_result.commission_percent_snapshot;
  return new;
end;
$$;

drop trigger if exists set_order_monetization on public.orders;
create trigger set_order_monetization
  before insert on public.orders
  for each row execute function public.trg_set_order_monetization();

drop trigger if exists set_plato_monetization on public.plato_videos;
create trigger set_plato_monetization
  before insert on public.plato_videos
  for each row execute function public.trg_set_plato_monetization();

-- ─────────────────────────────────────────────────────────────────────────────
-- Column-level UPDATE — same fix as 0013_lock_profile_trust_columns.sql,
-- same reason: the row-level "update own order"/"update own plato" policies
-- (0001, 0002) have no column restriction, which means "you may edit your
-- own row" actually means "you may write any column of your own row" —
-- including `monetizable`. Revoke table-wide UPDATE and grant back only what
-- the client legitimately writes today (`visibility`, `archived` — the only
-- two columns either table's own screens ever update).
-- ─────────────────────────────────────────────────────────────────────────────
revoke update on public.orders from authenticated, anon;
grant update (visibility, archived) on public.orders to authenticated;

revoke update on public.plato_videos from authenticated, anon;
grant update (visibility, archived) on public.plato_videos to authenticated;
