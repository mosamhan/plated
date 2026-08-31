-- Plated — geo-targeting for feed bumps.
-- Idempotent. Requires 0028_restaurant_subscriptions.sql.
--
-- `sponsored_placements` already has `target_zip_codes` (0028) but
-- `restaurant_feed_bumps` — the other sponsored mechanism, bumping a
-- specific already-posted plate back into the feed — has none. Brings it in
-- line so a restaurant's feed bump can be scoped to the same zip list as
-- their other placements, rather than reaching every user everywhere.

alter table public.restaurant_feed_bumps
  add column if not exists target_zip_codes text[] not null default '{}';
