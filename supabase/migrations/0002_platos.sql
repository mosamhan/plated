-- Plated — "Platos": creator video reels about specific plates.
-- Idempotent: safe to re-run whether or not this was already applied by hand
-- in the SQL Editor. Requires 0001_init.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- PLATO_VIDEOS  (a short vertical video a creator makes about a plate/restaurant)
-- restaurant_id is nullable + restaurant_name is denormalized so a Plato can
-- reference a Foursquare place that isn't in `restaurants` yet.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.plato_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  restaurant_id uuid references public.restaurants on delete set null,
  restaurant_name text not null,
  video_url text not null,
  poster_url text,
  dish_name text not null,
  rating numeric(3,1) check (rating >= 0 and rating <= 10),
  caption text default '',
  created_at timestamptz not null default now()
);
-- Index names match what Postgres would have auto-generated, so these are
-- no-ops if the table was created by the original non-idempotent script.
create index if not exists plato_videos_user_id_idx    on public.plato_videos (user_id);
create index if not exists plato_videos_created_at_idx on public.plato_videos (created_at desc);

-- Engagement signals. These double as the raw interaction data the future
-- personalization/ranking model will learn from (per-user × per-plato).
create table if not exists public.plato_likes (
  plato_id uuid not null references public.plato_videos on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plato_id, user_id)
);

create table if not exists public.plato_comments (
  id uuid primary key default gen_random_uuid(),
  plato_id uuid not null references public.plato_videos on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists plato_comments_plato_id_idx on public.plato_comments (plato_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.plato_videos   enable row level security;
alter table public.plato_likes    enable row level security;
alter table public.plato_comments enable row level security;

-- Public read for the reels feed
drop policy if exists "platos readable"         on public.plato_videos;
drop policy if exists "plato likes readable"    on public.plato_likes;
drop policy if exists "plato comments readable" on public.plato_comments;

create policy "platos readable"          on public.plato_videos   for select using (true);
create policy "plato likes readable"     on public.plato_likes    for select using (true);
create policy "plato comments readable"  on public.plato_comments for select using (true);

-- A creator manages only their own videos
drop policy if exists "insert own plato" on public.plato_videos;
drop policy if exists "update own plato" on public.plato_videos;
drop policy if exists "delete own plato" on public.plato_videos;

create policy "insert own plato" on public.plato_videos for insert with check (auth.uid() = user_id);
create policy "update own plato" on public.plato_videos for update using (auth.uid() = user_id);
create policy "delete own plato" on public.plato_videos for delete using (auth.uid() = user_id);

-- Join-table writes: only rows keyed to you
drop policy if exists "like plato as self"       on public.plato_likes;
drop policy if exists "unlike plato as self"     on public.plato_likes;
drop policy if exists "comment plato as self"    on public.plato_comments;
drop policy if exists "delete own plato comment" on public.plato_comments;

create policy "like plato as self"    on public.plato_likes    for insert with check (auth.uid() = user_id);
create policy "unlike plato as self"  on public.plato_likes    for delete using (auth.uid() = user_id);
create policy "comment plato as self" on public.plato_comments for insert with check (auth.uid() = user_id);
create policy "delete own plato comment" on public.plato_comments for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE  (public-read bucket; creators upload only into their own folder)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('platos','platos',true) on conflict do nothing;

drop policy if exists "plato videos readable"  on storage.objects;
drop policy if exists "upload own plato video" on storage.objects;
drop policy if exists "delete own plato video" on storage.objects;

create policy "plato videos readable" on storage.objects for select using (bucket_id = 'platos');
create policy "upload own plato video" on storage.objects for insert
  with check (bucket_id = 'platos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "delete own plato video" on storage.objects for delete
  using (bucket_id = 'platos' and auth.uid()::text = (storage.foldername(name))[1]);
