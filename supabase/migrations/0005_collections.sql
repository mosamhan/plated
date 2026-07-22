-- Plated — named Collections (saved lists) across restaurants, plates & platos.
-- Idempotent. Requires 0001_init.sql.
--
-- This is the richer layer above the existing flat `saves` table (which stays
-- as the quick plate-only bookmark). A collection is a user-named list; its
-- items are polymorphic so one list can mix restaurants, plates and platos.
-- Every user gets two starter lists ("Want to try", "Favorites") on signup.

-- ─────────────────────────────────────────────────────────────────────────────
-- COLLECTIONS  (a user-named saved list)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists collections_user_id_idx on public.collections (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- COLLECTION_ITEMS  (polymorphic membership: a restaurant / plate / plato)
-- item_id is a free uuid rather than a FK because it points at one of three
-- tables depending on item_type; integrity is enforced in app code + RLS.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.collection_items (
  collection_id uuid not null references public.collections on delete cascade,
  item_type text not null check (item_type in ('restaurant', 'plate', 'plato')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (collection_id, item_type, item_id)
);
create index if not exists collection_items_collection_id_idx on public.collection_items (collection_id);
-- Fast "which lists is this item in?" lookups for the Save-to picker's checkmarks.
create index if not exists collection_items_item_idx on public.collection_items (item_type, item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY — a user sees & manages only their own lists.
-- (Unlike likes/saves, collections are private, so reads are owner-scoped too.)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.collections      enable row level security;
alter table public.collection_items enable row level security;

drop policy if exists "own collections readable" on public.collections;
drop policy if exists "insert own collection"    on public.collections;
drop policy if exists "update own collection"    on public.collections;
drop policy if exists "delete own collection"    on public.collections;

create policy "own collections readable" on public.collections for select using (auth.uid() = user_id);
create policy "insert own collection"    on public.collections for insert with check (auth.uid() = user_id);
create policy "update own collection"    on public.collections for update using (auth.uid() = user_id);
create policy "delete own collection"    on public.collections for delete using (auth.uid() = user_id);

-- Items inherit their collection's ownership: you may touch an item row only if
-- you own the collection it belongs to.
drop policy if exists "own collection items readable" on public.collection_items;
drop policy if exists "insert into own collection"    on public.collection_items;
drop policy if exists "delete from own collection"    on public.collection_items;

create policy "own collection items readable" on public.collection_items for select using (
  exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
);
create policy "insert into own collection" on public.collection_items for insert with check (
  exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
);
create policy "delete from own collection" on public.collection_items for delete using (
  exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
);

-- ─────────────────────────────────────────────────────────────────────────────
-- STARTER LISTS — every new profile gets "Want to try" + "Favorites".
-- Hooks the existing profiles-insert flow; safe to re-run (drops first).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.seed_starter_collections()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.collections (user_id, name) values
    (new.id, 'Want to try'),
    (new.id, 'Favorites');
  return new;
end;
$$;

drop trigger if exists seed_starter_collections on public.profiles;
create trigger seed_starter_collections
  after insert on public.profiles
  for each row execute function public.seed_starter_collections();

-- Backfill starter lists for profiles that already exist and have none.
insert into public.collections (user_id, name)
select p.id, v.name
from public.profiles p
cross join (values ('Want to try'), ('Favorites')) as v(name)
where not exists (select 1 from public.collections c where c.user_id = p.id)
on conflict do nothing;
