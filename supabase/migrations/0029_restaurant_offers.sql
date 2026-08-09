-- Plated — restaurant coupons: cross-promoted deals and "Plated exclusive" in-store offers.
-- Idempotent. Requires 0001_init.sql (restaurants, profiles).
--
-- Two offer shapes, per the monetization plan:
--   general          — a code that also applies elsewhere (e.g. "TUESDAY" off
--                       the restaurant's own site), shown under a plate/profile.
--   plated_exclusive — "show this screen to your server", app-only. The
--                       redeem screen it powers uses redeem_window_seconds as a
--                       countdown so a screenshot can't outlive the visit.

create table if not exists public.restaurant_offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants on delete cascade,
  offer_type text not null check (offer_type in ('general', 'plated_exclusive')),
  title text not null,
  description text not null default '',
  promo_code text,
  redeem_window_seconds integer not null default 300,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists restaurant_offers_restaurant_idx on public.restaurant_offers (restaurant_id);

-- One redemption per user per offer — the anti-abuse rule the countdown
-- redeem screen exists to make hard to fake; this is what makes it enforceable
-- server-side rather than just UI theater.
create table if not exists public.offer_redemptions (
  offer_id uuid not null references public.restaurant_offers on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.restaurant_offers enable row level security;
alter table public.offer_redemptions enable row level security;

drop policy if exists "active offers readable" on public.restaurant_offers;
drop policy if exists "see own redemptions"    on public.offer_redemptions;
drop policy if exists "redeem as self"         on public.offer_redemptions;

create policy "active offers readable" on public.restaurant_offers
  for select using (active and (expires_at is null or expires_at > now()));
create policy "see own redemptions" on public.offer_redemptions
  for select using (auth.uid() = user_id);
create policy "redeem as self" on public.offer_redemptions
  for insert with check (auth.uid() = user_id);
