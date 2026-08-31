-- Plated — remove the consumer-facing "Pro" subscription tier.
--
-- Business model pivot: users stay 100% free, permanently. Revenue comes
-- from restaurants (see 0034+), not from a paid user tier. `pro_subscriptions`
-- (0030) was backend scaffolding for an in-app-purchase "Foodie Pro" tier —
-- confirmed never wired to any client UI or the RevenueCat SDK (no
-- `react-native-purchases` dependency ever added), so this is a clean removal
-- with no user-facing data loss.

drop table if exists public.pro_subscriptions;
