/**
 * Creates (or resumes) a Stripe Connect Express account for the calling
 * creator and returns an onboarding link. The client opens that link in an
 * in-app browser (react-native-inappbrowser-reborn); Stripe collects identity,
 * tax forms, and a payout destination on its own hosted page, then redirects
 * back into the app — nothing here ever touches a bank account number.
 *
 * Deploy:  supabase functions deploy stripe-connect-onboarding
 * Secret:  supabase secrets set STRIPE_SECRET_KEY=…
 */

import Stripe from 'npm:stripe@17.4.0';
import { CORS, json, requireUser, serviceClient } from '../_shared/http.ts';

interface Body {
  /** Where Stripe sends the creator back after finishing (or abandoning) onboarding. */
  returnUrl?: string;
  refreshUrl?: string;
}

// Only the app's own deep-link scheme — never an arbitrary destination Stripe
// (or a caller) could be tricked into redirecting a signed-in creator to.
const ALLOWED_SCHEME = 'plated://';

function isAppUrl(u: string | undefined): u is string {
  return typeof u === 'string' && u.startsWith(ALLOWED_SCHEME);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return json({ error: 'STRIPE_SECRET_KEY is not set' }, 500);

  const user = await requireUser(req);
  if (!user) return json({ error: 'sign-in required' }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const returnUrl = isAppUrl(body.returnUrl) ? body.returnUrl : `${ALLOWED_SCHEME}creator/stripe-return`;
  const refreshUrl = isAppUrl(body.refreshUrl) ? body.refreshUrl : `${ALLOWED_SCHEME}creator/stripe-refresh`;

  const stripe = new Stripe(key, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
  const db = serviceClient();

  try {
    const { data: existing } = await db
      .from('creator_stripe_accounts')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let accountId = existing?.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: { transfers: { requested: true } },
        metadata: { plated_user_id: user.id },
      });
      accountId = account.id;
      const { error: insertError } = await db
        .from('creator_stripe_accounts')
        .insert({ user_id: user.id, stripe_account_id: accountId });
      if (insertError) {
        console.error('[stripe-connect-onboarding] insert failed', insertError);
        return json({ error: 'could not save account' }, 500);
      }
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });

    return json({ url: link.url });
  } catch (e) {
    console.error('[stripe-connect-onboarding] stripe error', e);
    return json({ error: String(e) }, 502);
  }
});
