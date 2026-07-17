-- Plated — likes on Plato comments. Run in the Supabase SQL Editor after 0002_platos.sql.

create table public.plato_comment_likes (
  comment_id uuid not null references public.plato_comments on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.plato_comment_likes enable row level security;

create policy "plato comment likes readable"  on public.plato_comment_likes for select using (true);
create policy "like plato comment as self"    on public.plato_comment_likes for insert with check (auth.uid() = user_id);
create policy "unlike plato comment as self"  on public.plato_comment_likes for delete using (auth.uid() = user_id);
