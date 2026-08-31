-- Plated — lets a restaurant owner read the real numbers behind their own
-- business dashboard analytics. Idempotent. Requires 0027_creator_earnings.sql,
-- 0029_restaurant_offers.sql, 0032_restaurant_claims.sql (restaurant_owners).
--
-- Every one of these tables already has a "see your own rows" policy scoped
-- to the creator/customer side (0027, 0029) — there was no restaurant-owner
-- side because nothing before this needed it. Adding a second, independent
-- select policy per table (Postgres OR's multiple permissive policies
-- together) rather than editing the existing ones, so the creator/customer
-- read path is untouched.
--
-- No new write access anywhere here — analytics are read-only for an owner.

drop policy if exists "owner reads restaurant earnings" on public.creator_earnings;
create policy "owner reads restaurant earnings" on public.creator_earnings
  for select using (
    exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = creator_earnings.restaurant_id and o.user_id = auth.uid()
    )
  );

drop policy if exists "owner reads restaurant clicks" on public.affiliate_clicks;
create policy "owner reads restaurant clicks" on public.affiliate_clicks
  for select using (
    exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = affiliate_clicks.restaurant_id and o.user_id = auth.uid()
    )
  );

-- restaurant_offers' existing policy only exposes active, unexpired offers
-- (the shopper-facing read) — an owner needs their full history too.
drop policy if exists "owner reads own offers" on public.restaurant_offers;
create policy "owner reads own offers" on public.restaurant_offers
  for select using (
    exists (
      select 1 from public.restaurant_owners o
      where o.restaurant_id = restaurant_offers.restaurant_id and o.user_id = auth.uid()
    )
  );

drop policy if exists "owner reads own redemptions" on public.offer_redemptions;
create policy "owner reads own redemptions" on public.offer_redemptions
  for select using (
    exists (
      select 1
      from public.restaurant_offers ro
      join public.restaurant_owners o on o.restaurant_id = ro.restaurant_id
      where ro.id = offer_redemptions.offer_id and o.user_id = auth.uid()
    )
  );
