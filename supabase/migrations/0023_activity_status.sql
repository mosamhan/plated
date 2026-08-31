-- Plated — activity status ("Active 5m ago").
-- Idempotent. Requires 0001_init.sql.
--
-- Reciprocal by design, the way every app that ships this settles on: turning
-- your own status off also stops you seeing everyone else's. Otherwise the
-- setting is a one-way mirror, and the people who most want to hide are exactly
-- the ones who'd use it to watch. That rule is enforced in `visible_last_active`
-- below rather than in the client, so it can't be read around.

alter table public.profiles
  add column if not exists last_active_at timestamptz,
  add column if not exists show_activity boolean not null default true;

create index if not exists profiles_last_active_idx on public.profiles (last_active_at desc);

/*
 * Someone's last-active time, or null when it shouldn't be shown.
 *
 * SECURITY DEFINER because it has to read the *viewer's* own setting as well as
 * the subject's, and a plain view couldn't express "both of you have this on"
 * without exposing the column it's gating.
 */
create or replace function public.visible_last_active(subject uuid)
returns timestamptz
language sql stable
security definer set search_path = public
as $$
  select case
    -- You can always see your own.
    when subject = auth.uid() then p.last_active_at
    when not coalesce(p.show_activity, true) then null
    when not coalesce((select show_activity from public.profiles where id = auth.uid()), true) then null
    else p.last_active_at
  end
  from public.profiles p
  where p.id = subject
$$;

revoke all on function public.visible_last_active(uuid) from public;
grant execute on function public.visible_last_active(uuid) to authenticated;

/*
 * Heartbeat. Called when the app comes to the foreground.
 *
 * A plain UPDATE would need a policy letting clients write `last_active_at`,
 * and the same policy would let them write any *other* moment they liked —
 * including a fake one. Here the timestamp is `now()` on the server or nothing.
 */
create or replace function public.touch_last_active()
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles set last_active_at = now() where id = auth.uid()
$$;

revoke all on function public.touch_last_active() from public;
grant execute on function public.touch_last_active() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- COLUMN GRANTS
--
-- 0013 revoked table-wide UPDATE on profiles and granted it back column by
-- column, so any column added since is unwritable by clients until it's named
-- here. Two need adding:
--
--   show_activity   — new in this migration.
--   message_privacy — added in 0019 and missed at the time, which meant "Who
--                     can message you" failed with `permission denied for
--                     column message_privacy` on every save.
--
-- `last_active_at` is deliberately NOT granted: it's set by touch_last_active()
-- as `now()` on the server, so a client can't backdate or fake its presence.
grant update (show_activity, message_privacy) on public.profiles to authenticated;
