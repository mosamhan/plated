-- Per-post interaction options, set at create time (the "More options" screen):
-- turn off commenting, and hide the like count from everyone but the poster.
-- Both default false, so existing posts are unaffected.

alter table public.orders
  add column if not exists comments_disabled boolean not null default false,
  add column if not exists hide_like_count boolean not null default false;
