/**
 * RevenueCat webhook — keeps `pro_subscriptions` (the "Foodie Pro" / Creator ·
 * Business tier: badge, monthly feed bumps, profile pins) in sync with App
 * Store / Play Store billing state.
 *
 * Assumes the client configures the RevenueCat SDK with our own Supabase user
 * id as the app_user_id (`Purchases.configure({ appUserID: session.user.id })`)
 * — that's what lets a webhook event map straight onto a `profiles` row with
 * no separate identity-linking step.
 *
 * Deploy:  supabase functions deploy revenuecat-webhook --no-verify-jwt
 * Secret:  supabase secrets set REVENUECAT_WEBHOOK_AUTH=…
 *   (paste the same value into RevenueCat's dashboard → Webhooks →
 *   Authorization header field; RevenueCat echoes it back on every call)
 */

import { CORS, json, serviceClient } from '../_shared/http.ts';

function feedBumpAllotment(): number {
  const raw = Number(Deno.env.get('PRO_FEED_BUMPS_PER_PERIOD'));
  return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  product_id?: string;
  store?: string;
  expiration_at_ms?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expected) return json({ error: 'REVENUECAT_WEBHOOK_AUTH is not set' }, 500);
  if (req.headers.get('Authorization') !== `Bearer ${expected}`) return json({ error: 'forbidden' }, 403);

  let event: RevenueCatEvent;
  try {
    const body = await req.json();
    event = body.event;
  } catch {
    return json({ error: 'expected a JSON body' }, 400);
  }

  if (!event?.app_user_id || !UUID.test(event.app_user_id)) {
    // Not one of our accounts (e.g. RevenueCat's own anonymous test id) — ack
    // and drop, rather than fail the delivery and get retried forever.
    return json({ ignored: true });
  }

  const store: 'app_store' | 'play_store' | 'stripe' | null =
    event.store === 'APP_STORE' ? 'app_store' : event.store === 'PLAY_STORE' ? 'play_store' : null;

  const patch: Record<string, unknown> = {
    user_id: event.app_user_id,
    revenuecat_app_user_id: event.app_user_id,
    product_id: event.product_id ?? null,
    store,
    expires_at: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
      patch.status = 'active';
      if (event.type === 'RENEWAL' || event.type === 'INITIAL_PURCHASE') {
        patch.feed_bumps_remaining = feedBumpAllotment();
      }
      break;
    case 'CANCELLATION':
      // Auto-renew turned off — access continues until expiration_at_ms, so
      // status stays whatever it already is; only EXPIRATION flips it.
      break;
    case 'BILLING_ISSUE':
      patch.status = 'grace_period';
      break;
    case 'EXPIRATION':
      patch.status = 'expired';
      break;
    default:
      return json({ ignored: true, type: event.type });
  }

  const db = serviceClient();
  const { error } = await db.from('pro_subscriptions').upsert(patch, { onConflict: 'user_id' });
  if (error) {
    console.error('[revenuecat-webhook] upsert failed', error);
    return json({ error: 'could not record subscription state' }, 500);
  }

  return json({ ok: true });
});
