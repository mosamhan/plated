-- Plated — restaurants claiming their listing, and a custom (non-tiered) rate
-- the admin sets per restaurant while the user base is still small.
-- Idempotent. Requires 0001_init.sql (profiles, restaurants) and
-- 0028_restaurant_subscriptions.sql (restaurant_subscriptions, sponsored_placements).
--
-- Deliberately not a self-serve signup: at this stage a restaurant files a
-- claim (like `reports` in 0001 — anyone signed in may insert, nobody but an
-- admin reads the queue), and getting approved plus a rate is a manual,
-- negotiated step. `restaurant_owners` is the row that request turns into
-- once approved; nothing in this migration lets a claim self-approve.
--
-- The plan is to move this to fully self-serve once there's enough volume to
-- justify it — restaurant_subscriptions.tier stays a single value today, but
-- monthly_rate_cents is deliberately free-form per restaurant rather than
-- reintroducing a price list.

-- ─────────────────────────────────────────────────────────────────────────────
-- RESTAURANT_CLAIMS — a request to manage a restaurant's Plated listing
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.restaurant_claims (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants on delete cascade,
  claimant_id uuid not null references public.profiles on delete cascade,
  business_name text not null,
  role text not null,
  contact_email text not null,
  contact_phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists restaurant_claims_restaurant_idx on public.restaurant_claims (restaurant_id);
create index if not exists restaurant_claims_claimant_idx   on public.restaurant_claims (claimant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RESTAURANT_OWNERS — who's actually allowed to manage a restaurant's
-- promotion, once a claim above is approved. A claim is a request; this table
-- is the grant. Kept separate so approving never means "and now this text row
-- is trusted" — only an explicit insert here does.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.restaurant_owners (
  restaurant_id uuid not null references public.restaurants on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- The custom rate. Free-form because it's negotiated, not looked up — see the
-- header note. Nullable: a restaurant can be owned and not yet have a rate set
-- while the conversation is still happening.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.restaurant_subscriptions add column if not exists monthly_rate_cents integer;
alter table public.restaurant_subscriptions add column if not exists billing_note text;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.restaurant_claims enable row level security;
alter table public.restaurant_owners enable row level security;

drop policy if exists "file a claim"        on public.restaurant_claims;
drop policy if exists "see own claims"      on public.restaurant_claims;
drop policy if exists "see own ownerships"  on public.restaurant_owners;

-- File a claim: any signed-in user, same posture as `reports` in 0001. Nobody
-- but the claimant (and the admin, via service_role) ever reads the queue —
-- there is no "browse other people's claims" surface.
create policy "file a claim" on public.restaurant_claims
  for insert with check (auth.uid() = claimant_id);
create policy "see own claims" on public.restaurant_claims
  for select using (auth.uid() = claimant_id);

-- Ownership grants are written only by an admin approving a claim
-- (service_role) — never by the client. An owner reads their own grants so the
-- app knows which restaurants' dashboards to show them.
create policy "see own ownerships" on public.restaurant_owners
  for select using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Now that restaurant_owners exists, a claimed restaurant's own billing and
-- placements are readable by its owner — 0028 left both with no client-facing
-- read at all ("there's no restaurant-owner login yet"). Additive: these are
-- extra permissive policies alongside 0028's public "active only" placement
-- read, so an owner also sees their own draft/paused/ended rows.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "owner reads own subscription" on public.restaurant_subscriptions;
drop policy if exists "owner reads own placements"    on public.sponsored_placements;

create policy "owner reads own subscription" on public.restaurant_subscriptions
  for select using (
    exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = restaurant_subscriptions.restaurant_id and o.user_id = auth.uid()
    )
  );

create policy "owner reads own placements" on public.sponsored_placements
  for select using (
    exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = sponsored_placements.restaurant_id and o.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- An owner may pause/resume their own restaurant's placements — the one
-- self-serve control they get before the rate itself is self-serve. A row
-- policy's `using`/`with check` only decide which ROWS qualify, not which
-- COLUMNS may change, so "status only" has to be a column grant (same fix
-- 0013 applied to `profiles`) — without it this policy would let an owner
-- rewrite their own price_cents or headline too.
-- ─────────────────────────────────────────────────────────────────────────────
revoke update on public.sponsored_placements from authenticated, anon;
grant update (status) on public.sponsored_placements to authenticated;

drop policy if exists "owner toggles own placements" on public.sponsored_placements;

create policy "owner toggles own placements" on public.sponsored_placements
  for update using (
    status in ('active', 'paused')
    and exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = sponsored_placements.restaurant_id and o.user_id = auth.uid()
    )
  )
  with check (
    status in ('active', 'paused')
    and exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = sponsored_placements.restaurant_id and o.user_id = auth.uid()
    )
  );
