-- Plated — beta waitlist signups collected from joinplated.app, plus enough
-- state to track newsletter opt-in and beta/welcome invite emails without a
-- second table. Idempotent. Standalone — no earlier migration required.
--

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  newsletter_opt_in boolean not null default false,
  newsletter_opt_in_at timestamptz,
  newsletter_enrolled_at timestamptz,
  welcome_email_sent_at timestamptz,
  beta_invite_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_normalized check (email = lower(btrim(email))),
  constraint waitlist_signups_email_format check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

alter table public.waitlist_signups enable row level security;
revoke all on public.waitlist_signups from anon, authenticated;
grant all on public.waitlist_signups to service_role;
