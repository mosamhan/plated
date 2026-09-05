-- Plated — "not really me" for the taste-profile dashboard. Idempotent.
-- Requires 0071_taste_profile.sql.
--
-- Separate from `taste_categories` (the onboarding picks, a positive signal)
-- rather than just removing from that array: a category can show up on the
-- dashboard purely from interactions (likes/saves/reorders/shares) without
-- ever having been picked at onboarding, and dismissing it needs to mean
-- "stop suggesting this," not just "forget I said I liked it" — a real,
-- remembered negative signal the algorithm keeps honoring, not merely
-- something absent from a positive list.

alter table public.profiles add column if not exists taste_muted text[] not null default '{}';
grant update (taste_muted) on public.profiles to authenticated;
