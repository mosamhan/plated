/**
 * "Request Cashout" — sweeps the calling creator's confirmed, not-yet-paid
 * earnings into one Stripe transfer to their Connect account.
 *
 * PAYOUT_MINIMUM_CENTS mirrors PAYOUT_MINIMUM in src/app/creator.tsx (currently
 * $25) — keep the two in sync by hand; they're on opposite runtimes (Deno vs.
 * React Native) so there's no shared module to import it from.
 *
 * Not built for high-concurrency correctness (a solo creator tapping the
 * button twice in the same second is the realistic worst case, not a stampede)
 * but it doesn't lose track of money either: earnings are claimed by writing
 * this payout's id onto them, and a failed Stripe transfer un-claims them
 * rather than leaving them silently stuck.
 *
 * Deploy:  supabase functions deploy stripe-payout
 * Secret:  supabase secrets set STRIPE_SECRET_KEY=…
 */

import Stripe from 'npm:stripe@17.4.0';
import { CORS, json, requireUser, serviceClient } from '../_shared/http.ts';

const PAYOUT_MINIMUM_CENTS = 2500;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return json({ error: 'STRIPE_SECRET_KEY is not set' }, 500);

  const user = await requireUser(req);
  if (!user) return json({ error: 'sign-in required' }, 401);

  const stripe = new Stripe(key, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
  const db = serviceClient();

  const { data: account } = await db
    .from('creator_stripe_accounts')
    .select('stripe_account_id, payouts_enabled')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!account?.payouts_enabled) {
    return json({ error: 'complete Stripe onboarding before requesting a payout' }, 400);
  }

  const { data: earnings, error: earningsError } = await db
    .from('creator_earnings')
    .select('id, amount_cents')
    .eq('creator_id', user.id)
    .eq('status', 'confirmed')
    .is('payout_id', null);

  if (earningsError) {
    console.error('[stripe-payout] earnings lookup failed', earningsError);
    return json({ error: 'lookup failed' }, 500);
  }

  const total = (earnings ?? []).reduce((sum, e) => sum + e.amount_cents, 0);
  if (total < PAYOUT_MINIMUM_CENTS) {
    return json({ error: `balance below the $${PAYOUT_MINIMUM_CENTS / 100} minimum`, balanceCents: total }, 400);
  }
  const ids = earnings!.map((e) => e.id);

  const { data: payout, error: payoutError } = await db
    .from('creator_payouts')
    .insert({ creator_id: user.id, amount_cents: total, status: 'pending' })
    .select('id')
    .single();
  if (payoutError || !payout) {
    console.error('[stripe-payout] payout insert failed', payoutError);
    return json({ error: 'could not start payout' }, 500);
  }

  // Optimistic claim — only rows still unclaimed (payout_id is null) actually
  // move, so a concurrent request can't double-spend the same earning.
  const { data: claimed, error: claimError } = await db
    .from('creator_earnings')
    .update({ payout_id: payout.id })
    .in('id', ids)
    .is('payout_id', null)
    .select('amount_cents');

  const claimedTotal = (claimed ?? []).reduce((sum, e) => sum + e.amount_cents, 0);
  if (claimError || claimedTotal <= 0) {
    await db.from('creator_payouts').update({ status: 'failed' }).eq('id', payout.id);
    console.error('[stripe-payout] claim failed', claimError);
    return json({ error: 'could not claim earnings for payout' }, 500);
  }
  if (claimedTotal !== total) {
    await db.from('creator_payouts').update({ amount_cents: claimedTotal }).eq('id', payout.id);
  }

  try {
    const transfer = await stripe.transfers.create({
      amount: claimedTotal,
      currency: 'usd',
      destination: account.stripe_account_id,
      transfer_group: payout.id,
    });

    const now = new Date().toISOString();
    await db
      .from('creator_payouts')
      .update({ status: 'paid', stripe_transfer_id: transfer.id, paid_at: now })
      .eq('id', payout.id);
    await db.from('creator_earnings').update({ status: 'paid', paid_at: now }).eq('payout_id', payout.id);

    return json({ ok: true, amountCents: claimedTotal, transferId: transfer.id });
  } catch (e) {
    console.error('[stripe-payout] stripe transfer failed', e);
    // Un-claim so these earnings are eligible for the next cashout attempt.
    await db.from('creator_earnings').update({ payout_id: null }).eq('payout_id', payout.id);
    await db.from('creator_payouts').update({ status: 'failed' }).eq('id', payout.id);
    return json({ error: String(e) }, 502);
  }
});
