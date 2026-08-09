-- Plated — restaurant subscriptions, feed bumps, and paid sponsored placements.
-- Idempotent. Requires 0001_init.sql (restaurants, orders).
--
-- Backend for the early-stage "Local Favorites" flat-fee tier from the
-- monetization plan: a restaurant pays a monthly subscription and gets a fixed
-- allotment of feed bumps (pin an existing user's plate to the top of nearby
-- feeds) plus optional paid placements (reel ads, map pins). No client screen
-- reads this yet — this is schema and Stripe plumbing for that to be built
-- against next.
--
-- Deliberately NOT a programmatic CPM bidding engine. At this DAU stage, flat
-- monthly pricing avoids having to track precise impression counts, which is a
-- genuinely hard problem to get right — sponsored_placements.price_cents is a
-- flat rate, not a bid, on purpose.

create table if not exists public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants on delete cascade,
  tier text not null default 'local_favorite' check (tier in ('local_favorite')),
  status text not null default 'incomplete' check (status in ('incomplete', 'active', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  -- Reset to the tier's monthly allotment by the stripe-webhook function on
  -- each `invoice.paid` event.
  feed_bumps_remaining integer not null default 0,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A restaurant can have many canceled/incomplete rows over time (re-subscribing
-- after a lapse), but only one that's actually active or on its way there.
create unique index if not exists restaurant_subscriptions_one_live
  on public.restaurant_subscriptions (restaurant_id)
  where status in ('incomplete', 'active', 'past_due');
create index if not exists restaurant_subscriptions_stripe_customer_idx
  on public.restaurant_subscriptions (stripe_customer_id);

create table if not exists public.restaurant_feed_bumps (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.restaurant_subscriptions on delete cascade,
  order_id uuid not null references public.orders on delete cascade,
  bumped_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 days')
);
create index if not exists restaurant_feed_bumps_order_idx   on public.restaurant_feed_bumps (order_id);
create index if not exists restaurant_feed_bumps_expires_idx on public.restaurant_feed_bumps (expires_at);

create table if not exists public.sponsored_placements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants on delete cascade,
  placement_type text not null check (placement_type in ('reel_ad', 'map_pin', 'local_favorite')),
  media_url text,
  headline text,
  cta_url text,
  -- Broad city/zip targeting, not live GPS — the plan's own blind-spot warning
  -- is that a restaurant's pitch only works if the user base is locally dense,
  -- which a zip list is enough to reason about at this stage.
  target_zip_codes text[] not null default '{}',
  price_cents integer not null check (price_cents >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sponsored_placements_restaurant_idx on public.sponsored_placements (restaurant_id);
create index if not exists sponsored_placements_live_idx
  on public.sponsored_placements (status, starts_at, ends_at);

-- Optional direct deep links into a restaurant's own storefront on each
-- delivery platform. OrderProviderSheet falls back to a search query when
-- these are absent, same as it does today.
alter table public.restaurants add column if not exists doordash_store_url text;
alter table public.restaurants add column if not exists ubereats_store_url text;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.restaurant_subscriptions enable row level security;
alter table public.restaurant_feed_bumps    enable row level security;
alter table public.sponsored_placements     enable row level security;

drop policy if exists "feed bumps readable"       on public.restaurant_feed_bumps;
drop policy if exists "active placements readable" on public.sponsored_placements;

-- The feed needs to know which orders are currently bumped and which
-- placements are live to render them — same public-read posture as
-- `restaurants readable` in 0001. Billing state itself (restaurant_subscriptions)
-- has no policy at all: there's no restaurant-owner login yet, so nothing but
-- the platform's own admin tooling (running as service_role) reads it.
create policy "feed bumps readable" on public.restaurant_feed_bumps for select using (true);
create policy "active placements readable" on public.sponsored_placements
  for select using (status = 'active');
