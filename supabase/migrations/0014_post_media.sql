-- Multi-plate posts: a post can carry several photos/clips, each with its own
-- dish name and rating (the carousel in the feed). Stored as a jsonb array on
-- the order rather than a child table, because it's always read and written
-- whole with the post, never queried across posts.
--
-- Shape: [{ "uri": text, "type": "image"|"clip", "dish_name": text, "rating": number }, ...]
--
-- Legacy single-photo posts leave this null; the client's postMedia() helper
-- synthesises a one-entry carousel from photo_url/dish_name/rating for those,
-- so nothing has to backfill.

alter table public.orders
  add column if not exists media jsonb;
