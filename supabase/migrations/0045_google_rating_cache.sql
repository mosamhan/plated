-- Plated — cached Google rating (out of 5), shown next to Plated's own
-- 0-10 average on the restaurant detail sheet. Idempotent. Requires
-- 0001_init.sql.
--
-- Cached rather than fetched live on every view: Google's Places API is a
-- billed, rate-limited call per lookup, and a restaurant's Google rating
-- doesn't meaningfully change minute to minute. `google-restaurant-rating`
-- (the Edge Function) only calls out when this cache is empty or stale
-- (>30 days old, checked client-side against google_rating_fetched_at), then
-- writes the result back here via service_role.

alter table public.restaurants
  add column if not exists google_place_id text,
  add column if not exists google_rating numeric(2,1) check (google_rating >= 0 and google_rating <= 5),
  add column if not exists google_rating_count integer check (google_rating_count >= 0),
  add column if not exists google_rating_fetched_at timestamptz;
