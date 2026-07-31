-- Plated — Plato view tracking.
-- Idempotent. Requires 0002_platos.sql.
--
-- Two pieces, deliberately:
--   • plato_views — one row per (plato, viewer). This is the raw per-user ×
--     per-plato signal the ranking/personalization work will train on, and the
--     composite primary key means a rewatch can't inflate the number.
--   • plato_videos.view_count — a denormalized count so the reel can render a
--     number without an aggregate query per video. Kept in step by a trigger,
--     never written by the client.

create table if not exists public.plato_views (
  plato_id uuid not null references public.plato_videos on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (plato_id, user_id)
);
create index if not exists plato_views_user_id_idx on public.plato_views (user_id);
-- "Who watched this?" and the recency ordering the model will want.
create index if not exists plato_views_plato_viewed_idx on public.plato_views (plato_id, viewed_at desc);

alter table public.plato_videos
  add column if not exists view_count integer not null default 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- COUNT MAINTENANCE — the client inserts a view and the count follows, so a
-- caller can never set the number directly.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bump_plato_view_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.plato_videos
       set view_count = view_count + 1
     where id = new.plato_id;
    return new;
  end if;
  update public.plato_videos
     set view_count = greatest(view_count - 1, 0)
   where id = old.plato_id;
  return old;
end $$;

drop trigger if exists plato_views_bump on public.plato_views;
create trigger plato_views_bump
  after insert or delete on public.plato_views
  for each row execute function public.bump_plato_view_count();

-- Backfill so the column matches any rows that already exist.
update public.plato_videos v
   set view_count = coalesce(c.n, 0)
  from (select plato_id, count(*)::int as n from public.plato_views group by plato_id) c
 where c.plato_id = v.id
   and v.view_count is distinct from c.n;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — counts are public (they're shown on every reel); a viewer may only
-- record their own view, and can't rewrite or delete history.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.plato_views enable row level security;

drop policy if exists "plato views readable"  on public.plato_views;
drop policy if exists "insert own plato view" on public.plato_views;

create policy "plato views readable"  on public.plato_views for select using (true);
create policy "insert own plato view" on public.plato_views for insert with check (auth.uid() = user_id);
