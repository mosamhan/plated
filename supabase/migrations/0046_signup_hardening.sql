-- Plated — make signup survive handle collisions, and let the client check a
-- handle before submitting.
-- Idempotent. Requires 0001_init.sql (profiles, handle_new_user).
--
-- Two problems this fixes:
--
-- 1. `handle_new_user()` inserted the requested handle directly into
--    `profiles.handle`, which is `unique not null`. A collision raised inside
--    an AFTER INSERT trigger, which aborts the whole `auth.users` insert — so
--    signing up with a taken username failed with a 500 "Database error saving
--    new user" and *no account was created*. Now the trigger de-duplicates by
--    suffixing, so signup always succeeds; the client's own check (below) is
--    what steers people to a handle they actually want.
--
-- 2. There was no way to ask "is this handle free?" before submitting. RLS on
--    `profiles` allows reading rows, but an anonymous visitor on the signup
--    screen has no session, so a plain select isn't available pre-auth. The
--    RPC below answers only that one yes/no question.

-- ─────────────────────────────────────────────────────────────────────────────
-- Collision-proof handle assignment
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested text;
  candidate text;
  suffix int := 0;
begin
  -- Normalised the same way the client normalises it, so "@Sam" and "sam"
  -- can't both be claimed.
  requested := lower(regexp_replace(
    coalesce(new.raw_user_meta_data->>'handle', ''), '[^a-zA-Z0-9_.]', '', 'g'
  ));
  if requested = '' then
    requested := 'guest_' || substr(new.id::text, 1, 8);
  end if;

  candidate := requested;
  -- Bounded rather than a bare loop: an unbounded retry on a pathological
  -- collision would hold the signup transaction open indefinitely.
  while suffix < 50 and exists (select 1 from public.profiles p where p.handle = candidate) loop
    suffix := suffix + 1;
    candidate := requested || suffix::text;
  end loop;
  if exists (select 1 from public.profiles p where p.handle = candidate) then
    -- Give up on the requested name rather than the signup; the id-derived
    -- fallback is unique by construction.
    candidate := 'guest_' || substr(new.id::text, 1, 8);
  end if;

  insert into public.profiles (id, name, handle, avatar_url)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'New Guest'),
    candidate,
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Pre-signup handle availability
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns only a boolean — never a row, a count, or a hint about who holds it,
-- so this can't be used to enumerate accounts beyond "taken / not taken",
-- which is inherent to any username field.
create or replace function public.handle_available(p_handle text)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (
    select 1 from public.profiles
    where handle = lower(regexp_replace(coalesce(p_handle, ''), '[^a-zA-Z0-9_.]', '', 'g'))
  );
$$;

revoke all on function public.handle_available(text) from public;
grant execute on function public.handle_available(text) to anon, authenticated;
