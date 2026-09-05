-- Plated — "Do not include in taste profile" on a Plato. Idempotent.
-- Requires 0002_platos.sql.
--
-- Records that a viewer asked for a specific Plato to be left out. Two
-- effects, both handled entirely client-side for now: the Plato drops out of
-- that viewer's own feed immediately (PlatosContext filters it out on load
-- and removes it from state on the action itself), and the row is kept
-- around as the raw signal a future taste-profile/ranking feature will read.
-- Strictly a private, per-viewer preference — never visible to anyone else,
-- including the Plato's creator.

create table if not exists public.plato_taste_exclusions (
  plato_id uuid not null references public.plato_videos on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plato_id, user_id)
);
create index if not exists plato_taste_exclusions_user_id_idx on public.plato_taste_exclusions (user_id);

alter table public.plato_taste_exclusions enable row level security;

drop policy if exists "read own taste exclusions" on public.plato_taste_exclusions;
drop policy if exists "insert own taste exclusion" on public.plato_taste_exclusions;
drop policy if exists "delete own taste exclusion" on public.plato_taste_exclusions;

-- A viewer can only ever see, record, or undo their own preference — this is
-- not a public signal like a like or a view.
create policy "read own taste exclusions" on public.plato_taste_exclusions
  for select using (auth.uid() = user_id);
create policy "insert own taste exclusion" on public.plato_taste_exclusions
  for insert with check (auth.uid() = user_id);
create policy "delete own taste exclusion" on public.plato_taste_exclusions
  for delete using (auth.uid() = user_id);
