-- Plated — daily check-ins, the backing store for the streak.
-- Idempotent. Requires 0001_init.sql.
--
-- One row per (user, calendar day). Server-side rather than on-device because a
-- streak that resets on reinstall isn't worth showing, and one that trusts the
-- phone clock isn't worth trusting: `day` is derived from now() here, never
-- passed in by the client.

create table if not exists public.check_ins (
  user_id uuid not null references public.profiles on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Streaks are read newest-first and walked backwards.
create index if not exists check_ins_user_day_idx on public.check_ins (user_id, day desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Recording a check-in. The client calls this instead of inserting, so `day`
-- comes from the server's clock and a repeat call the same day is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_check_in()
returns date
language plpgsql
security definer set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.check_ins (user_id, day)
       values (auth.uid(), today)
  on conflict do nothing;
  return today;
end $$;

grant execute on function public.record_check_in() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — your own history only. Nobody writes directly: inserts go through
-- record_check_in() above, so there's deliberately no insert policy.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.check_ins enable row level security;

drop policy if exists "see own check ins" on public.check_ins;
create policy "see own check ins" on public.check_ins for select using (auth.uid() = user_id);
