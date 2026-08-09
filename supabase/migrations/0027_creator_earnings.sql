-- Plated — creator earnings pipeline: affiliate clicks → earnings ledger → Stripe Connect payouts.
-- Idempotent. Requires 0001_init.sql (profiles, orders, restaurants) and
-- 0013_lock_profile_trust_columns.sql (the compensation_eligible lockdown this mirrors).
--
-- This is the backend for the Creator dashboard (src/app/creator.tsx), which today
-- renders PREVIEW_ATTRIBUTIONS — a hardcoded mock explicitly commented as standing
-- in "until connected to an affiliate network (Impact.com etc.)". These tables are
-- what that real connection writes into.
--
-- FTC 16 CFR 465 shapes every table here, same as 0013:
--   - Earnings accrue on ATTRIBUTED ORDERS, never on the rating given. Nothing
--     below conditions payment on a positive review.
--   - A creator can never earn on their own order — blocked by a check constraint
--     on affiliate_clicks, not left to application code to remember.
--   - Money tables have no insert/update/delete policy for authenticated or anon at
--     all, so the affiliate-network postback and Stripe (both running as
--     service_role) are the only writers. The client only ever reads its own rows —
--     the same "column grants make the wrong write fail before any policy runs"
--     posture 0013 introduced, applied at the table level here since these tables
--     have no legitimate client-writable column to begin with.

-- ─────────────────────────────────────────────────────────────────────────────
-- AFFILIATE_CLICKS — one row per "order this" tap that leaves the app
-- ─────────────────────────────────────────────────────────────────────────────
-- click_token is embedded as the affiliate network's subId (see the
-- affiliate-click Edge Function) so the network's postback — arriving days
-- later, server to server — can find its way back to this exact tap.
create table if not exists public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  click_token uuid not null default gen_random_uuid() unique,
  user_id uuid not null references public.profiles on delete cascade,
  creator_id uuid references public.profiles on delete set null,
  order_id uuid references public.orders on delete set null,
  restaurant_id uuid not null references public.restaurants on delete cascade,
  platform text not null check (platform in ('doordash', 'ubereats', 'pickup')),
  created_at timestamptz not null default now(),
  check (creator_id is null or creator_id <> user_id)
);
create index if not exists affiliate_clicks_creator_idx on public.affiliate_clicks (creator_id);
create index if not exists affiliate_clicks_order_idx   on public.affiliate_clicks (order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- CREATOR_STRIPE_ACCOUNTS — one Stripe Connect Express account per creator
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.creator_stripe_accounts (
  user_id uuid primary key references public.profiles on delete cascade,
  stripe_account_id text not null unique,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CREATOR_PAYOUTS — a batch of confirmed earnings swept into one Stripe transfer
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.creator_payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  stripe_transfer_id text,
  requested_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists creator_payouts_creator_idx on public.creator_payouts (creator_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- CREATOR_EARNINGS — the ledger. One row per qualifying postback.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.creator_earnings (
  id uuid primary key default gen_random_uuid(),
  click_id uuid not null references public.affiliate_clicks on delete cascade unique,
  creator_id uuid not null references public.profiles on delete cascade,
  order_id uuid references public.orders on delete set null,
  restaurant_id uuid not null references public.restaurants on delete cascade,
  -- What the affiliate network paid Plated for this conversion.
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  -- What the creator is owed — gross_amount_cents times the creator's share
  -- (PLATED_CREATOR_SHARE_BPS in the affiliate-postback function). Stored
  -- pre-computed so the dashboard never needs to know the split to render a number.
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'paid', 'voided')),
  external_transaction_id text,
  payout_id uuid references public.creator_payouts on delete set null,
  created_at timestamptz not null default now(),
  -- Affiliate networks confirm on ~30-day schedules to absorb cancellations and
  -- refunds — the creator dashboard's "confirms in ~30 days" copy names this gap.
  confirms_at timestamptz not null default (now() + interval '30 days'),
  confirmed_at timestamptz,
  paid_at timestamptz
);
create index if not exists creator_earnings_creator_idx on public.creator_earnings (creator_id, status);
create index if not exists creator_earnings_payout_idx  on public.creator_earnings (payout_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.affiliate_clicks       enable row level security;
alter table public.creator_stripe_accounts enable row level security;
alter table public.creator_payouts        enable row level security;
alter table public.creator_earnings       enable row level security;

drop policy if exists "see own or credited clicks" on public.affiliate_clicks;
drop policy if exists "see own stripe account"      on public.creator_stripe_accounts;
drop policy if exists "see own payouts"             on public.creator_payouts;
drop policy if exists "see own earnings"            on public.creator_earnings;

-- Reads only — every write on these four tables comes from a service_role Edge
-- Function (affiliate-click records the click; affiliate-postback, stripe-payout
-- and the stripe-webhook write everything else), so no insert/update/delete
-- policy exists for authenticated or anon on any of them.
create policy "see own or credited clicks" on public.affiliate_clicks
  for select using (auth.uid() = user_id or auth.uid() = creator_id);
create policy "see own stripe account" on public.creator_stripe_accounts
  for select using (auth.uid() = user_id);
create policy "see own payouts" on public.creator_payouts
  for select using (auth.uid() = creator_id);
create policy "see own earnings" on public.creator_earnings
  for select using (auth.uid() = creator_id);
