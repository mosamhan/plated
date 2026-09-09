-- Plated — a real taste profile: onboarding category picks, plus a queryable
-- share-intent signal that didn't exist before. Idempotent. Requires
-- 0066_plato_taste_exclusions.sql (that migration's own header comment: "the
-- row is kept around as the raw signal a future taste-profile/ranking
-- feature will read" — this is that feature; nothing here duplicates it).
--
-- `taste_categories` stores the PlaceType keys (see src/lib/placeType.ts) the
-- user picked at onboarding — a closed, client-defined enum, so this is a
-- plain text[] rather than a new lookup table. `taste_onboarded` gates
-- whether the picker still needs to be shown; existing accounts are
-- backfilled to true (skip) so this doesn't retroactively interrupt anyone
-- already using the app, while every new signup (both onboarding paths —
-- OAuth via onboarding.tsx and email/password, which skips that flow
-- entirely) gets the column's new default of false.

alter table public.profiles add column if not exists taste_categories text[] not null default '{}';
alter table public.profiles add column if not exists taste_onboarded boolean;
update public.profiles set taste_onboarded = true where taste_onboarded is null;
alter table public.profiles alter column taste_onboarded set default false;
alter table public.profiles alter column taste_onboarded set not null;

grant update (taste_categories, taste_onboarded) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTENT_SHARES — "shared this" is a stronger interest signal than a view or
-- even a like, and previously wasn't logged anywhere queryable (only the
-- resulting chat message existed, which isn't something a ranking pass can
-- efficiently scan). One row per share action, against exactly one of a
-- plate or a Plato — same polymorphic-by-two-nullable-columns shape as
-- messages' own comment_post_id/attachment split, not a lookup-table
-- polymorphism, since there are only ever two kinds.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.content_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  order_id uuid references public.orders on delete cascade,
  plato_id uuid references public.plato_videos on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(order_id, plato_id) = 1)
);
create index if not exists content_shares_user_idx on public.content_shares (user_id);

alter table public.content_shares enable row level security;

drop policy if exists "insert own shares" on public.content_shares;
create policy "insert own shares" on public.content_shares for insert with check (auth.uid() = user_id);
drop policy if exists "read own shares" on public.content_shares;
create policy "read own shares" on public.content_shares for select using (auth.uid() = user_id);
