-- Plated — one level of threaded replies on Plato comments.
-- Idempotent. Requires 0003_plato_comment_likes.sql.

alter table public.plato_comments
  add column if not exists parent_id uuid references public.plato_comments on delete cascade;

create index if not exists plato_comments_parent_id_idx on public.plato_comments (parent_id);
