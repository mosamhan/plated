/**
 * One Stripe webhook endpoint for both things Stripe touches in this app:
 *   - Connect `account.updated` — a creator finished (or un-finished) onboarding.
 *   - Restaurant subscription billing — checkout completing, monthly renewal,
 *     a failed card, or a cancellation.
 * Kept as one endpoint (one webhook secret, one signing config in the Stripe
 * dashboard) rather than two, since Stripe is fine sending both event families
 * to the same URL and the two `if` branches don't interact.
 *
 * Restaurant Checkout Sessions must be created with
 * `metadata: { restaurant_id, tier, commission_percent }` and
 * `mode: 'subscription'` — that's how a `checkout.session.completed` event
 * here finds its way back to a row in `restaurants`, and how the
 * restaurant's once-only commission rate (0035_restaurant_subscription_tiers.sql)
 * gets locked in. Self-serve tiers (starter, growth) go through
 * stripe-restaurant-checkout; the `custom` tier is still admin-created.
 *
 * Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
 * Secrets:
 *   supabase secrets set STRIPE_SECRET_KEY=…
 *   supabase secrets set STRIPE_WEBHOOK_SECRET=…                 # from the Stripe dashboard's endpoint config
 *   supabase secrets set RESTAURANT_FEED_BUMPS_PER_PERIOD=12      # optional, defaults to 12/month (~3/week)
 * Then in the Stripe dashboard, point one webhook endpoint at this function's
 * URL, subscribed to: account.updated, checkout.session.completed,
 * invoice.paid, invoice.payment_failed, customer.subscription.deleted.
 */

import Stripe from 'npm:stripe@17.4.0';
import { CORS, json, serviceClient } from '../_shared/http.ts';

function feedBumpAllotment(): number {
  const raw = Number(Deno.env.get('RESTAURANT_FEED_BUMPS_PER_PERIOD'));
  return Number.isFinite(raw) && raw > 0 ? raw : 12;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!key || !webhookSecret) return json({ error: 'Stripe secrets are not set' }, 500);

  const stripe = new Stripe(key, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get('stripe-signature');
  const payload = await req.text();
  if (!signature) return json({ error: 'missing stripe-signature header' }, 400);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    console.error('[stripe-webhook] signature verification failed', e);
    return json({ error: 'invalid signature' }, 400);
  }

  const db = serviceClient();

  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      const { error } = await db
        .from('creator_stripe_accounts')
        .update({
          payouts_enabled: !!account.payouts_enabled,
          details_submitted: !!account.details_submitted,
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_account_id', account.id);
      if (error) console.error('[stripe-webhook] account.updated write failed', error);
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const restaurantId = session.metadata?.restaurant_id;
      if (session.mode !== 'subscription' || !restaurantId || !session.subscription) break;

      const tier = session.metadata?.tier;
      const commissionPercent = session.metadata?.commission_percent
        ? Number(session.metadata.commission_percent)
        : null;

      const { error } = await db.from('restaurant_subscriptions').upsert(
        {
          restaurant_id: restaurantId,
          status: 'active',
          stripe_customer_id: String(session.customer),
          stripe_subscription_id: String(session.subscription),
          feed_bumps_remaining: feedBumpAllotment(),
          updated_at: new Date().toISOString(),
          ...(tier ? { tier } : {}),
          // Locked once, here, on first successful payment — never overwritten
          // on renewal (invoice.paid below doesn't touch these two columns).
          ...(commissionPercent != null
            ? { commission_percent: commissionPercent, commission_locked_at: new Date().toISOString() }
            : {}),
        },
        { onConflict: 'stripe_subscription_id' },
      );
      if (error) console.error('[stripe-webhook] checkout.session.completed write failed', error);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.subscription) break;
      const subscription = await stripe.subscriptions.retrieve(String(invoice.subscription));
      const { error } = await db
        .from('restaurant_subscriptions')
        .update({
          status: 'active',
          feed_bumps_remaining: feedBumpAllotment(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', String(invoice.subscription));
      if (error) console.error('[stripe-webhook] invoice.paid write failed', error);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.subscription) break;
      const { error } = await db
        .from('restaurant_subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', String(invoice.subscription));
      if (error) console.error('[stripe-webhook] invoice.payment_failed write failed', error);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const { error } = await db
        .from('restaurant_subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', subscription.id);
      if (error) console.error('[stripe-webhook] customer.subscription.deleted write failed', error);
      break;
    }

    default:
      break;
  }

  return json({ received: true });
});
