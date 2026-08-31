-- Plated — a publicly-readable "verified restaurant" flag.
-- Idempotent. Requires 0032_restaurant_claims.sql, 0035_restaurant_subscription_tiers.sql.
--
-- `restaurant_claims` and `restaurant_subscriptions` have no public-select
-- policy at all (by design — claim contact info and billing state are
-- private) — which means an ordinary user looking at a restaurant has no way
-- to read whether it's verified. Rather than a public view re-deriving the
-- join on every read, this follows the same pattern already used for
-- `profiles.verified`/`profiles.compensation_eligible`: a stored, service-
-- role-only boolean on the public-readable row. Kept correct by a trigger,
-- not by every write path remembering the AND — a restaurant's claim being
-- approved and its subscription being active can each change independently
-- (claim approval is a one-time admin action; subscription status flips
-- constantly via Stripe webhooks), so deriving it in one place that always
-- runs is what actually guarantees a lapsed payment revokes the badge.

alter table public.restaurants add column if not exists verified boolean not null default false;

create or replace function public.recompute_restaurant_verified(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.restaurants r set verified = (
    exists (select 1 from public.restaurant_claims c where c.restaurant_id = p_restaurant_id and c.status = 'approved')
    and exists (select 1 from public.restaurant_subscriptions s where s.restaurant_id = p_restaurant_id and s.status = 'active')
  )
  where r.id = p_restaurant_id;
end;
$$;

create or replace function public.trg_recompute_restaurant_verified_from_claims()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_restaurant_verified(coalesce(new.restaurant_id, old.restaurant_id));
  return null;
end;
$$;

create or replace function public.trg_recompute_restaurant_verified_from_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_restaurant_verified(coalesce(new.restaurant_id, old.restaurant_id));
  return null;
end;
$$;

drop trigger if exists recompute_verified_on_claim_change on public.restaurant_claims;
create trigger recompute_verified_on_claim_change
  after insert or update of status or delete on public.restaurant_claims
  for each row execute function public.trg_recompute_restaurant_verified_from_claims();

drop trigger if exists recompute_verified_on_subscription_change on public.restaurant_subscriptions;
create trigger recompute_verified_on_subscription_change
  after insert or update of status or delete on public.restaurant_subscriptions
  for each row execute function public.trg_recompute_restaurant_verified_from_subscriptions();
