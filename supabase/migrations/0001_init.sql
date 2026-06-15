-- Plated — initial schema, row-level security, and storage.
-- Paste this whole file into the Supabase SQL Editor and run it once.

-- ─────────────────────────────────────────────────────────────────────────────
-- PROFILES  (one row per auth user; auto-created on signup by the trigger below)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default 'New Guest',
  handle text unique not null,
  avatar_url text,
  bio text default '',
  verified boolean not null default false,
  socials jsonb not null default '{}'::jsonb,
  compensation_eligible boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RESTAURANTS  (persisted from Foursquare the first time a user adds a plate)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  fsq_id text unique,                       -- Foursquare place id
  name text not null,
  image_url text,
  cuisine text,
  location text,
  lat double precision,
  lng double precision,
  price_level text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ORDERS  (a "plate" — the core unit of Plated)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  restaurant_id uuid not null references public.restaurants on delete cascade,
  dish_name text not null,
  photo_url text,
  description text default '',
  rating numeric(3,1) not null check (rating >= 0 and rating <= 10),
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.orders (restaurant_id);
create index on public.orders (user_id);
create index on public.orders (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- SOCIAL EDGES
-- ─────────────────────────────────────────────────────────────────────────────
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index on public.comments (order_id);

create table public.likes (
  order_id uuid not null references public.orders on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (order_id, user_id)
);

create table public.saves (
  order_id uuid not null references public.orders on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (order_id, user_id)
);

-- the reorder signal — highest-praise action
create table public.reorders (
  order_id uuid not null references public.orders on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (order_id, user_id)
);

create table public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  following_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles on delete set null,
  target_type text not null check (target_type in ('plate','user','comment')),
  target_id text not null,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,  -- recipient
  kind text not null check (kind in ('like','comment','follow','reorder','earnings','milestone')),
  actor_id uuid references public.profiles on delete cascade,
  order_id uuid references public.orders on delete cascade,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- "Plated's Rating" — cumulative average per restaurant
-- ─────────────────────────────────────────────────────────────────────────────
create view public.restaurant_ratings as
  select restaurant_id,
         round(avg(rating)::numeric, 1) as plated_rating,
         count(*) as order_count
  from public.orders
  group by restaurant_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-create a profile when a new auth user signs up
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, handle, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'New Guest'),
    coalesce(new.raw_user_meta_data->>'handle', 'guest_' || substr(new.id::text, 1, 8)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles      enable row level security;
alter table public.restaurants   enable row level security;
alter table public.orders        enable row level security;
alter table public.comments      enable row level security;
alter table public.likes         enable row level security;
alter table public.saves         enable row level security;
alter table public.reorders      enable row level security;
alter table public.follows       enable row level security;
alter table public.blocks        enable row level security;
alter table public.reports       enable row level security;
alter table public.notifications enable row level security;

-- Public read for discovery surfaces
create policy "profiles readable"    on public.profiles    for select using (true);
create policy "restaurants readable" on public.restaurants for select using (true);
create policy "orders readable"      on public.orders      for select using (true);
create policy "comments readable"    on public.comments    for select using (true);
create policy "likes readable"       on public.likes       for select using (true);
create policy "saves readable"       on public.saves       for select using (true);
create policy "reorders readable"    on public.reorders    for select using (true);
create policy "follows readable"     on public.follows     for select using (true);

-- Profiles: a user manages only their own row
create policy "update own profile" on public.profiles for update using (auth.uid() = id);

-- Restaurants: any signed-in user can add one
create policy "insert restaurants" on public.restaurants for insert with check (auth.uid() is not null);

-- Orders: insert/update/delete only your own
create policy "insert own order" on public.orders for insert with check (auth.uid() = user_id);
create policy "update own order" on public.orders for update using (auth.uid() = user_id);
create policy "delete own order" on public.orders for delete using (auth.uid() = user_id);

-- Comments: insert/delete your own
create policy "insert own comment" on public.comments for insert with check (auth.uid() = user_id);
create policy "delete own comment" on public.comments for delete using (auth.uid() = user_id);

-- Join-table writes: only rows keyed to you
create policy "like as self"     on public.likes    for insert with check (auth.uid() = user_id);
create policy "unlike as self"   on public.likes    for delete using (auth.uid() = user_id);
create policy "save as self"     on public.saves    for insert with check (auth.uid() = user_id);
create policy "unsave as self"   on public.saves    for delete using (auth.uid() = user_id);
create policy "reorder as self"  on public.reorders for insert with check (auth.uid() = user_id);
create policy "follow as self"   on public.follows  for insert with check (auth.uid() = follower_id);
create policy "unfollow as self" on public.follows  for delete using (auth.uid() = follower_id);

-- Blocks: private to the blocker
create policy "see own blocks"    on public.blocks for select using (auth.uid() = blocker_id);
create policy "block as self"     on public.blocks for insert with check (auth.uid() = blocker_id);
create policy "unblock as self"   on public.blocks for delete using (auth.uid() = blocker_id);

-- Reports: anyone signed-in files; nobody reads via the client (moderation backend only)
create policy "file report" on public.reports for insert with check (auth.uid() is not null);

-- Notifications: you see and update only your own
create policy "see own notifications"    on public.notifications for select using (auth.uid() = user_id);
create policy "update own notifications"  on public.notifications for update using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE  (public-read buckets; users write only into their own folder)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('plates','plates',true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('avatars','avatars',true) on conflict do nothing;

create policy "plate photos readable" on storage.objects for select using (bucket_id = 'plates');
create policy "avatars readable"      on storage.objects for select using (bucket_id = 'avatars');
create policy "upload own plate photo" on storage.objects for insert
  with check (bucket_id = 'plates' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "upload own avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
