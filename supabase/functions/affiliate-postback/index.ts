/**
 * Affiliate-network postback receiver (Impact.com "Electronic Postback" shape,
 * or any network that can hit a URL you configure with your own query params).
 *
 * The network calls this itself once a conversion happens, and again later
 * when it locks/confirms the payout — never the app. It carries no user JWT,
 * so a shared secret is the auth boundary here (same role the service-role
 * check plays in `push`), not `requireUser`.
 *
 * You control the exact query-string shape when you configure the postback
 * URL in the network's dashboard — point it at:
 *   https://…/affiliate-postback?secret=…&click_token={SUBID3}&status=confirmed
 *     &gross_amount_cents={PAYOUT_CENTS}&external_id={ACTION_ID}
 * mapping whatever status vocabulary the network uses onto pending/confirmed/voided.
 *
 * Deploy:  supabase functions deploy affiliate-postback --no-verify-jwt
 * Secrets:
 *   supabase secrets set AFFILIATE_POSTBACK_SECRET=…
 *   supabase secrets set PLATED_CREATOR_SHARE_BPS=6000   # creator's cut, basis points; default 60%
 */

import { CORS, json, serviceClient } from '../_shared/http.ts';

type Status = 'pending' | 'confirmed' | 'voided';

function creatorShareBps(): number {
  const raw = Number(Deno.env.get('PLATED_CREATOR_SHARE_BPS'));
  return Number.isFinite(raw) && raw > 0 && raw <= 10_000 ? raw : 6000;
}

async function readParams(req: Request): Promise<URLSearchParams> {
  if (req.method === 'GET') return new URL(req.url).searchParams;
  try {
    const body = await req.json();
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  } catch {
    return new URLSearchParams();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const params = await readParams(req);

  const secret = Deno.env.get('AFFILIATE_POSTBACK_SECRET');
  if (!secret) return json({ error: 'AFFILIATE_POSTBACK_SECRET is not set' }, 500);
  if (params.get('secret') !== secret) return json({ error: 'forbidden' }, 403);

  const clickToken = params.get('click_token');
  const status = params.get('status') as Status | null;
  const grossAmountCents = Number(params.get('gross_amount_cents'));
  const externalId = params.get('external_id');

  if (!clickToken) return json({ error: 'click_token required' }, 400);
  if (!status || !['pending', 'confirmed', 'voided'].includes(status)) {
    return json({ error: 'status must be pending, confirmed, or voided' }, 400);
  }
  if (!Number.isFinite(grossAmountCents) || grossAmountCents < 0) {
    return json({ error: 'gross_amount_cents must be a non-negative number' }, 400);
  }

  const db = serviceClient();

  const { data: click, error: clickError } = await db
    .from('affiliate_clicks')
    .select('id, creator_id, order_id, restaurant_id')
    .eq('click_token', clickToken)
    .maybeSingle();

  if (clickError) {
    console.error('[affiliate-postback] click lookup failed', clickError);
    return json({ error: 'lookup failed' }, 500);
  }
  if (!click) return json({ error: 'unknown click_token' }, 404);

  // No creator was credited on this click (e.g. a self-order) — nothing to pay.
  if (!click.creator_id) return json({ skipped: 'no creator credited' });

  const amountCents = Math.round((grossAmountCents * creatorShareBps()) / 10_000);

  const { error: upsertError } = await db
    .from('creator_earnings')
    .upsert(
      {
        click_id: click.id,
        creator_id: click.creator_id,
        order_id: click.order_id,
        restaurant_id: click.restaurant_id,
        gross_amount_cents: grossAmountCents,
        amount_cents: amountCents,
        status,
        external_transaction_id: externalId,
        confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
      },
      { onConflict: 'click_id' },
    );

  if (upsertError) {
    console.error('[affiliate-postback] upsert failed', upsertError);
    return json({ error: 'could not record earning' }, 500);
  }

  return json({ ok: true, amountCents, status });
});
