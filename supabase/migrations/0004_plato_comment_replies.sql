-- Plated — one level of threaded replies on Plato comments.
-- Run in the Supabase SQL Editor after 0003_plato_comment_likes.sql.

alter table public.plato_comments
  add column parent_id uuid references public.plato_comments on delete cascade;

create index on public.plato_comments (parent_id);
