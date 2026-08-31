-- Plated — extras for the redesigned onboarding flow: an optional date of
-- birth (for birthday specials/recommendations) and a lightweight
-- "request we add this restaurant" queue for the new find-restaurant detour.
-- Idempotent. Requires 0001_init.sql (profiles) and 0032_restaurant_claims.sql
-- (the claim-review posture this mirrors).

alter table public.profiles add column if not exists date_of_birth date;
grant update (date_of_birth) on public.profiles to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RESTAURANT_REQUESTS — "we couldn't find it, please add it" from onboarding's
-- find-restaurant detour. Deliberately separate from restaurant_claims
-- (0032): a claim is "this existing Plated listing is mine," a request is
-- "this restaurant doesn't exist on Plated yet" — no restaurant_id to attach
-- to. Same manual-review posture: insert-own, select-own, no self-serve grant.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.restaurant_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles on delete cascade,
  business_name text not null,
  location text not null,
  contact_email text not null,
  contact_phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  created_at timestamptz not null default now()
);
create index if not exists restaurant_requests_requester_idx on public.restaurant_requests (requester_id);

alter table public.restaurant_requests enable row level security;

drop policy if exists "file a request" on public.restaurant_requests;
drop policy if exists "see own requests" on public.restaurant_requests;

create policy "file a request" on public.restaurant_requests
  for insert with check (auth.uid() = requester_id);
create policy "see own requests" on public.restaurant_requests
  for select using (auth.uid() = requester_id);
