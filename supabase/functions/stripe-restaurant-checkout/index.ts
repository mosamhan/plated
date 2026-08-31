/**
 * Self-serve Stripe Checkout for restaurant subscription tiers (starter,
 * growth) — a web Checkout Session opened with `Linking.openURL`, not a
 * native purchase flow. This is B2B advertising/subscription spend, not
 * consumer digital content, so it's exempt from (and must stay off) Apple's
 * IAP path and its 30% cut. The `custom` tier is still the existing
 * manual/invoiced path (0032_restaurant_claims.sql) and never goes through
 * this function.
 *
 * `commissionPercent` is set ONCE here, by the restaurant, at signup.
 * `stripe-webhook`'s `checkout.session.completed` handler is what actually
 * writes `commission_percent`/`commission_locked_at` once payment succeeds —
 * this function only refuses to start a new Checkout Session if a rate is
 * already locked in, so a restaurant can't silently re-lock it by starting a
 * second subscription. Changing a locked rate requires the manual
 * commission_rate_change_requests path (0035_restaurant_subscription_tiers.sql).
 *
 * Prices below are TEST-MODE PLACEHOLDERS — swap in real numbers before
 * going live. Built with inline `price_data` rather than pre-created Stripe
 * Price/Product ids, so there's nothing to set up in the Stripe dashboard
 * first.
 *
 * Deploy: supabase functions deploy stripe-restaurant-checkout
 * Secrets:
 *   supabase secrets set STRIPE_SECRET_KEY=…
 *   supabase secrets set APP_URL=https://joinplated.app   # optional, defaults below
 */
import Stripe from 'npm:stripe@17.4.0';
import { CORS, json, requireUser, serviceClient } from '../_shared/http.ts';

const TIER_PRICES_CENTS: Record<string, number> = {
  starter: 4900,
  growth: 14900,
};

const MIN_COMMISSION_PERCENT = 5;
const MAX_COMMISSION_PERCENT = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return json({ error: 'STRIPE_SECRET_KEY is not set' }, 500);

  const user = await requireUser(req);
  if (!user) return json({ error: 'sign-in required' }, 401);

  const body = await req.json().catch(() => ({}));
  const restaurantId = typeof body.restaurantId === 'string' ? body.restaurantId : null;
  const tier = typeof body.tier === 'string' ? body.tier : null;
  const commissionPercent = Number(body.commissionPercent);

  if (!restaurantId || !tier || !(tier in TIER_PRICES_CENTS)) {
    return json({ error: 'restaurantId and a valid tier (starter, growth) are required' }, 400);
  }
  if (
    !Number.isFinite(commissionPercent) ||
    commissionPercent < MIN_COMMISSION_PERCENT ||
    commissionPercent > MAX_COMMISSION_PERCENT
  ) {
    return json(
      { error: `commissionPercent must be between ${MIN_COMMISSION_PERCENT} and ${MAX_COMMISSION_PERCENT}` },
      400,
    );
  }

  const db = serviceClient();

  const { data: owner } = await db
    .from('restaurant_owners')
    .select('restaurant_id')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!owner) return json({ error: 'not an owner of this restaurant' }, 403);

  const { data: locked } = await db
    .from('restaurant_subscriptions')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .not('commission_locked_at', 'is', null)
    .maybeSingle();
  if (locked) {
    return json(
      { error: 'a commission rate is already locked for this restaurant — use the rate change request form to adjust it' },
      409,
    );
  }

  const stripe = new Stripe(key, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const appUrl = Deno.env.get('APP_URL') ?? 'https://joinplated.app';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          recurring: { interval: 'month' },
          unit_amount: TIER_PRICES_CENTS[tier],
          product_data: { name: `Plated for restaurants — ${tier}` },
        },
        quantity: 1,
      },
    ],
    metadata: {
      restaurant_id: restaurantId,
      tier,
      commission_percent: String(commissionPercent),
    },
    success_url: `${appUrl}/business/${restaurantId}?checkout=success`,
    cancel_url: `${appUrl}/business/${restaurantId}?checkout=cancel`,
  });

  return json({ url: session.url });
});
