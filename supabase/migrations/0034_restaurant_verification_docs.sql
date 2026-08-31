-- Plated — restaurant claim verification documents.
-- Idempotent. Requires 0032_restaurant_claims.sql.
--
-- Extends the existing manual claim-review flow (0032) with the documents an
-- admin actually needs to confirm the claimant owns the business: a
-- government-issued ID, proof of authorization (business license, or a
-- utility bill/lease at the business address), and a storefront photo.
--
-- Deliberately NOT collecting EIN/SSN here — that's a Stripe Connect concern
-- for creator *payouts*, and restaurants never receive a payout from Plated
-- in this model (they pay a subscription; see 0035). Nothing in this
-- migration needs sensitive tax-id material.
--
-- These are Storage paths in a new *private* bucket, not public URLs — every
-- other bucket in this app (plates/avatars/platos/stories/voice) is
-- public-read by design (user-generated content meant to be seen); a
-- driver's license photo is not, so it gets its own bucket rather than
-- reusing one of those.

alter table public.restaurant_claims
  add column if not exists id_document_path text,
  add column if not exists authorization_document_path text,
  add column if not exists storefront_photo_path text;

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE — private bucket, readable only by the claimant who uploaded a
-- given file (and the admin, via service_role, same posture as the claims
-- queue itself in 0032).
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('restaurant-verification', 'restaurant-verification', false)
  on conflict do nothing;

drop policy if exists "read own verification docs"   on storage.objects;
drop policy if exists "upload own verification docs" on storage.objects;

create policy "read own verification docs" on storage.objects for select
  using (bucket_id = 'restaurant-verification' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "upload own verification docs" on storage.objects for insert
  with check (bucket_id = 'restaurant-verification' and auth.uid()::text = (storage.foldername(name))[1]);
