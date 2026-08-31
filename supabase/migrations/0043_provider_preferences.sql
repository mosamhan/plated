-- Plated — remembered order-provider and maps-app preferences.
-- Idempotent. Requires 0024 (user_settings).
--
-- Both default to 'ask' — first use always shows the chooser; whatever the
-- user picks then becomes sticky. A user can set it back to 'ask' from
-- Settings to be asked again. `user_settings` already has no column-level
-- grant restriction (every column is owner-writable), so no grant/policy
-- changes are needed here.

alter table public.user_settings
  add column if not exists preferred_order_provider text not null default 'ask'
    check (preferred_order_provider in ('doordash', 'ubereats', 'ask')),
  add column if not exists preferred_maps_app text not null default 'ask'
    check (preferred_maps_app in ('apple', 'google', 'ask'));
