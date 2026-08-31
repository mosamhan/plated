-- Plated — self-serve editing of a restaurant's own sponsored placements.
-- Idempotent. Requires 0028_restaurant_subscriptions.sql, 0032_restaurant_claims.sql,
-- 0036_restaurant_verified_flag.sql.
--
-- Before this, an owner could only toggle `status` (0032) — everything else
-- (headline, media, geo-targeting) was admin-only. Widen the column grant to
-- the fields a restaurant should reasonably manage themselves once they're
-- verified+active (see `restaurants.verified`, the same derived gate that
-- controls the badge and ad access generally — a lapsed subscription loses
-- this too, automatically, by construction). `price_cents`/`placement_type`
-- stay admin-only: those are the negotiated/billed part.
--
-- Editing is disallowed once a placement has `ended` — nothing to edit on a
-- placement that's already run its course.

revoke update on public.sponsored_placements from authenticated, anon;
grant update (status, headline, media_url, cta_url, target_zip_codes) on public.sponsored_placements to authenticated;

drop policy if exists "owner toggles own placements" on public.sponsored_placements;
drop policy if exists "owner edits own placements" on public.sponsored_placements;

create policy "owner edits own placements" on public.sponsored_placements
  for update using (
    status <> 'ended'
    and exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = sponsored_placements.restaurant_id and o.user_id = auth.uid()
    )
    and exists (
      select 1 from public.restaurants r
      where r.id = sponsored_placements.restaurant_id and r.verified
    )
  )
  with check (
    status in ('active', 'paused')
    and exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = sponsored_placements.restaurant_id and o.user_id = auth.uid()
    )
    and exists (
      select 1 from public.restaurants r
      where r.id = sponsored_placements.restaurant_id and r.verified
    )
  );
