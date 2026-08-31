-- Plated — search-intent signal for personalization.
-- Idempotent. Requires 0001_init.sql (profiles).
--
-- InlineSearch is currently fully ephemeral — nothing about what someone
-- searches for is persisted anywhere. This is the first record of it,
-- scoped deliberately narrow: only queries `placeTypeFor` (lib/placeType.ts)
-- actually classifies as a food/cuisine term get a row at all — a person's
-- name or a random typo never does, so this table can't become a general
-- search-history log by accident.

create table if not exists public.search_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  query text not null,
  matched_place_type text not null check (matched_place_type in (
    'cafe', 'bakery', 'bar', 'pizza', 'sushi', 'ramen', 'burgers',
    'mexican', 'italian', 'french', 'steakhouse', 'seafood', 'midEast', 'vegan'
  )),
  created_at timestamptz not null default now()
);
create index if not exists search_queries_user_idx on public.search_queries (user_id, created_at desc);

alter table public.search_queries enable row level security;

drop policy if exists "see own search queries"   on public.search_queries;
drop policy if exists "log own search queries"   on public.search_queries;

create policy "see own search queries" on public.search_queries for select using (auth.uid() = user_id);
create policy "log own search queries" on public.search_queries for insert with check (auth.uid() = user_id);
