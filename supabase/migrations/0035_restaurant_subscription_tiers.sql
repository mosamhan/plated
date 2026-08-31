-- Plated — hybrid subscription tiers + locked creator commission rate.
-- Idempotent. Requires 0028_restaurant_subscriptions.sql, 0032_restaurant_claims.sql.
--
-- Widens the single `local_favorite` tier (0028's comment: "no client screen
-- reads this yet") into a real hybrid model: self-serve flat tiers for small
-- operators, a `custom` tier for negotiated multi-location deals (reuses
-- 0032's `monthly_rate_cents`/`billing_note`, unchanged). `local_favorite`
-- stays a valid value rather than being migrated away — cheap to keep, and
-- nothing currently depends on it being gone.
--
-- `commission_percent` is what a restaurant pays creators per reorder,
-- chosen once when they subscribe. It is NEVER writable by the client: this
-- table already has zero insert/update policy for `authenticated` (0028's
-- own comment — "there's no restaurant-owner login yet... nothing but the
-- platform's own admin tooling... reads it", which now extends to *writes*
-- too) and that's exactly the protection this needs — only the checkout/
-- webhook edge functions (service_role) ever set it, once, and refuse to
-- change it outside the request flow below.
alter table public.restaurant_subscriptions
  drop constraint if exists restaurant_subscriptions_tier_check;
alter table public.restaurant_subscriptions
  add constraint restaurant_subscriptions_tier_check
  check (tier in ('local_favorite', 'starter', 'growth', 'custom'));

alter table public.restaurant_subscriptions
  add column if not exists commission_percent numeric(4,1) check (commission_percent >= 0 and commission_percent <= 100),
  add column if not exists commission_locked_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMISSION_RATE_CHANGE_REQUESTS — the one path to changing a locked rate.
-- A request, not a write: an admin reviews and manually applies it (same
-- posture as restaurant_claims itself), so there's no automatic way for a
-- restaurant to retroactively change what a creator was promised.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.commission_rate_change_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants on delete cascade,
  requested_by uuid not null references public.profiles on delete cascade,
  current_percent numeric(4,1),
  requested_percent numeric(4,1) not null check (requested_percent >= 0 and requested_percent <= 100),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists commission_rate_change_requests_restaurant_idx
  on public.commission_rate_change_requests (restaurant_id);

alter table public.commission_rate_change_requests enable row level security;

drop policy if exists "file a rate change request" on public.commission_rate_change_requests;
drop policy if exists "see own rate change requests" on public.commission_rate_change_requests;

-- Only an existing owner of the restaurant may ask — filing a claim alone
-- isn't enough, since a rate only exists once a subscription already does.
create policy "file a rate change request" on public.commission_rate_change_requests
  for insert with check (
    auth.uid() = requested_by
    and exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = commission_rate_change_requests.restaurant_id and o.user_id = auth.uid()
    )
  );
create policy "see own rate change requests" on public.commission_rate_change_requests
  for select using (auth.uid() = requested_by);
