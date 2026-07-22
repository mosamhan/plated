-- Plated — multi-item posts. A "plate" (order) can now carry several menu items
-- the user had, each with its own 0–10 rating. The order's headline
-- dish_name/rating stays as the single highest-rated item; order_items holds
-- the full set. A restaurant's crowd-sourced menu = the distinct item names
-- posted there.
-- Idempotent. Requires 0001_init.sql.

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  name text not null,
  rating numeric(3,1) not null default 0,
  -- display order within the post (0 = headline / best item)
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY — items are publicly readable (they're part of the post),
-- writable only by the owner of the parent order.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.order_items enable row level security;

drop policy if exists "order items readable"     on public.order_items;
drop policy if exists "insert own order items"    on public.order_items;
drop policy if exists "update own order items"    on public.order_items;
drop policy if exists "delete own order items"    on public.order_items;

create policy "order items readable" on public.order_items for select using (true);
create policy "insert own order items" on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "update own order items" on public.order_items for update using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "delete own order items" on public.order_items for delete using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);

-- Menu of a restaurant = distinct dish names people have posted there, most
-- recent first. A convenience view for the create-flow suggestions.
create or replace view public.restaurant_menu as
select distinct on (o.restaurant_id, lower(oi.name))
  o.restaurant_id,
  oi.name,
  max(oi.created_at) over (partition by o.restaurant_id, lower(oi.name)) as last_seen
from public.order_items oi
join public.orders o on o.id = oi.order_id;
