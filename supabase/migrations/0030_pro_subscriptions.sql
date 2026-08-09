-- Plated — the "Pro" subscription tier (verified-style badge perks, monthly feed
-- bumps, profile pins), sold as an in-app purchase and reconciled via RevenueCat.
-- Idempotent. Requires 0001_init.sql (profiles).
--
-- One row per user, written only by the revenuecat-webhook Edge Function — the
-- client never writes here. Same rationale as 0013's compensation_eligible
-- lockdown: whether a subscription is currently active is trust the client
-- reports having paid for, not something it gets to assert on its own row.

create table if not exists public.pro_subscriptions (
  user_id uuid primary key references public.profiles on delete cascade,
  status text not null default 'inactive'
    check (status in ('active', 'inactive', 'grace_period', 'expired')),
  product_id text,
  store text check (store in ('app_store', 'play_store', 'stripe')),
  revenuecat_app_user_id text unique,
  -- Monthly allotment for the "3 feed bumps/month" perk; reset by the webhook
  -- on each RENEWAL event.
  feed_bumps_remaining integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pro_subscriptions enable row level security;

drop policy if exists "see own pro subscription" on public.pro_subscriptions;

create policy "see own pro subscription" on public.pro_subscriptions
  for select using (auth.uid() = user_id);
