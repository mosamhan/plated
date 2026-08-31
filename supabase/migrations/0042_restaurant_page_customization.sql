-- Plated — restaurant page customization + explicit order/reservation mode.
-- Idempotent. Requires 0001_init.sql, 0032_restaurant_claims.sql (restaurant_owners),
-- 0036_restaurant_verified_flag.sql (restaurants.verified).
--
-- Everything here is owner-editable, but only once verified (approved claim +
-- active subscription — the same derived gate Phase A/B use for the badge and
-- ad access). `restaurants` has never had a client UPDATE policy at all before
-- this (only "readable" + "insert restaurants" from 0001, for Foursquare-sync
-- inserts) — this is the first write access an owner gets on their own row.
--
-- order_mode lets OrderProviderSheet show a restaurant's actual preference
-- instead of guessing from price_level; reservation_platform/url and
-- external_order_url are what it hands off to. custom_name/custom_photos are
-- purely presentational overrides — the Foursquare-sourced name/image stay as
-- the fallback (see mapRestaurant), never overwritten.

alter table public.restaurants
  add column if not exists custom_name text,
  add column if not exists custom_photos text[] not null default '{}',
  add column if not exists order_mode text check (order_mode in ('delivery', 'reservation')),
  add column if not exists reservation_platform text check (reservation_platform in ('opentable', 'resy', 'other')),
  add column if not exists reservation_url text,
  add column if not exists external_order_url text;

revoke update on public.restaurants from authenticated, anon;
grant update (custom_name, custom_photos, order_mode, reservation_platform, reservation_url, external_order_url)
  on public.restaurants to authenticated;

drop policy if exists "owner edits own restaurant page" on public.restaurants;
create policy "owner edits own restaurant page" on public.restaurants
  for update using (
    verified
    and exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = restaurants.id and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = restaurants.id and o.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RESTAURANT_MENU_ITEMS — an owner's own menu entries, layered on top of the
-- Foursquare + crowd-rated menu MenuPanel already builds (see mergeMenu in
-- src/lib/dishes.ts). Nothing before this let an owner add a dish directly;
-- previously the only sources were Foursquare's API and what diners posted.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.restaurant_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants on delete cascade,
  name text not null,
  description text,
  price_cents integer check (price_cents >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists restaurant_menu_items_restaurant_idx on public.restaurant_menu_items (restaurant_id, position);

alter table public.restaurant_menu_items enable row level security;

drop policy if exists "menu items readable" on public.restaurant_menu_items;
drop policy if exists "owner writes own menu items" on public.restaurant_menu_items;

create policy "menu items readable" on public.restaurant_menu_items for select using (true);

create policy "owner writes own menu items" on public.restaurant_menu_items
  for all using (
    exists (
      select 1 from public.restaurant_owners o
      join public.restaurants r on r.id = o.restaurant_id
      where o.restaurant_id = restaurant_menu_items.restaurant_id and o.user_id = auth.uid() and r.verified
    )
  )
  with check (
    exists (
      select 1 from public.restaurant_owners o
      join public.restaurants r on r.id = o.restaurant_id
      where o.restaurant_id = restaurant_menu_items.restaurant_id and o.user_id = auth.uid() and r.verified
    )
  );
