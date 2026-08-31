-- Plated — flag brand-new OAuth signups (Google/Apple) so the client can send
-- them through a first-run setup flow (username, name, photo) before they can
-- use the app. Email/password signup already collects name+username inline
-- in its own form and is unaffected.
-- Idempotent. Requires 0046_signup_hardening.sql (handle_new_user).

alter table public.profiles
  add column if not exists needs_onboarding boolean not null default false;

-- `raw_app_meta_data->>'provider'` is GoTrue-owned (set by Supabase Auth
-- itself, not user-controllable), so it's a reliable "how did this account
-- get created" signal — unlike `raw_user_meta_data`, which the client fills
-- in and could in principle be spoofed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested text;
  candidate text;
  suffix int := 0;
begin
  requested := lower(regexp_replace(
    coalesce(new.raw_user_meta_data->>'handle', ''), '[^a-zA-Z0-9_.]', '', 'g'
  ));
  if requested = '' then
    requested := 'guest_' || substr(new.id::text, 1, 8);
  end if;

  candidate := requested;
  while suffix < 50 and exists (select 1 from public.profiles p where p.handle = candidate) loop
    suffix := suffix + 1;
    candidate := requested || suffix::text;
  end loop;
  if exists (select 1 from public.profiles p where p.handle = candidate) then
    candidate := 'guest_' || substr(new.id::text, 1, 8);
  end if;

  insert into public.profiles (id, name, handle, avatar_url, needs_onboarding)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'New Guest'),
    candidate,
    new.raw_user_meta_data->>'avatar_url',
    (new.raw_app_meta_data->>'provider') is distinct from 'email'
  );
  return new;
end;
$$;

grant update (needs_onboarding) on public.profiles to authenticated;
