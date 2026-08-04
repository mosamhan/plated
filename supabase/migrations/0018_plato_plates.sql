-- A Plato can cover several plates from one visit — one video, but the label
-- (dish name + rating) swipes between the dishes tried. Same shape as an
-- order's items: [{ "dish_name": text, "rating": number }, ...].
--
-- Legacy Platos leave this null; the client falls back to the single
-- dish_name/rating, treated as a one-plate list.

alter table public.plato_videos
  add column if not exists plates jsonb;
