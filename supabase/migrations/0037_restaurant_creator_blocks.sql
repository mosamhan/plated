-- Plated — a restaurant's ability to block a specific creator from earning
-- commission on posts that tag them.
-- Idempotent. Requires 0032_restaurant_claims.sql (restaurant_owners), 0001_init.sql (profiles).
--
-- The default is open: any creator who meets the Plated Creator bar (see
-- 0038) can tag a verified restaurant and earn its set commission. This
-- table is the one-way-out for a restaurant that doesn't want to be
-- associated with a specific creator, without having to lock the feature
-- down for everyone else.

create table if not exists public.restaurant_creator_blocks (
  restaurant_id uuid not null references public.restaurants on delete cascade,
  creator_id uuid not null references public.profiles on delete cascade,
  blocked_by uuid not null references public.profiles on delete cascade,
  blocked_at timestamptz not null default now(),
  primary key (restaurant_id, creator_id)
);
create index if not exists restaurant_creator_blocks_creator_idx on public.restaurant_creator_blocks (creator_id);

alter table public.restaurant_creator_blocks enable row level security;

drop policy if exists "owner manages own blocks" on public.restaurant_creator_blocks;
drop policy if exists "owner reads own blocks"   on public.restaurant_creator_blocks;

-- Only an owner of the restaurant may block/unblock — same
-- `restaurant_owners` join every other owner-scoped policy in this schema
-- uses (0032's "owner reads own subscription", "owner toggles own placements").
create policy "owner reads own blocks" on public.restaurant_creator_blocks
  for select using (
    exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = restaurant_creator_blocks.restaurant_id and o.user_id = auth.uid()
    )
  );
create policy "owner manages own blocks" on public.restaurant_creator_blocks
  for insert with check (
    auth.uid() = blocked_by
    and exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = restaurant_creator_blocks.restaurant_id and o.user_id = auth.uid()
    )
  );
create policy "owner removes own blocks" on public.restaurant_creator_blocks
  for delete using (
    exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = restaurant_creator_blocks.restaurant_id and o.user_id = auth.uid()
    )
  );
