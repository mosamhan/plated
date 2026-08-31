/**
 * Client hooks into the monetization Edge Functions: affiliate-click (order
 * hand-off tracking), stripe-connect-onboarding and stripe-payout (creator
 * payouts). Same shape as lib/places.ts's callPlaces — every call rides on
 * the signed-in session via supabase.functions.invoke and degrades gracefully
 * rather than throwing, because none of these should ever be able to break
 * the flow they sit next to (ordering, viewing the dashboard).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Edge Functions here answer 4xx with a JSON `{ error }` body for expected
 * failures (below payout minimum, onboarding incomplete) — surface that body
 * instead of collapsing every non-2xx into an unlabeled null.
 */
async function call<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.functions.invoke<T>(fn, { body });
    if (error) {
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          return (await context.clone().json()) as T;
        } catch {
          // not JSON — fall through to the generic warn/null below
        }
      }
      if (__DEV__) console.warn(`[Plated] ${fn} failed`, error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    if (__DEV__) console.warn(`[Plated] ${fn} request error`, e);
    return null;
  }
}

export type OrderPlatform = 'doordash' | 'ubereats' | 'pickup';

interface AffiliateClickResult {
  url: string;
  clickToken: string;
}

/**
 * Records the hand-off and returns the URL to actually open — wrapped with
 * affiliate tracking once a network is connected, the destination unchanged
 * otherwise. Always resolves to a usable URL: on any failure it falls back to
 * `destinationUrl` so a tracking hiccup never blocks someone from ordering.
 */
export async function trackAffiliateClick(opts: {
  restaurantId: string;
  orderId?: string;
  creatorId?: string;
  platform: OrderPlatform;
  destinationUrl: string;
}): Promise<string> {
  const result = await call<AffiliateClickResult>('affiliate-click', opts);
  return result?.url ?? opts.destinationUrl;
}

interface OnboardingLink {
  url?: string;
  error?: string;
}

/** Stripe Connect Express onboarding link for the signed-in creator, or null on failure. */
export async function startStripeOnboarding(): Promise<string | null> {
  const result = await call<OnboardingLink>('stripe-connect-onboarding', {});
  return result?.url ?? null;
}

interface CashoutResponse {
  ok?: true;
  amountCents?: number;
  error?: string;
}

export type CashoutResult = { ok: true; amountCents: number } | { ok: false; message: string };

/** Sweeps the creator's confirmed, unpaid earnings into one Stripe transfer. */
export async function requestCashout(): Promise<CashoutResult> {
  const result = await call<CashoutResponse>('stripe-payout', {});
  if (!result) return { ok: false, message: 'Something went wrong — try again.' };
  if (result.error) return { ok: false, message: result.error };
  return { ok: true, amountCents: result.amountCents ?? 0 };
}

interface CreatorEligibilityResponse {
  eligible?: boolean;
  error?: string;
}

/**
 * Asks check-creator-eligibility to re-verify the signed-in user's counts
 * server-side and flip `compensation_eligible` if all five thresholds are
 * genuinely met. Safe to call speculatively — it's a no-op read when the
 * user isn't eligible yet, and idempotent once they are.
 */
export async function checkCreatorEligibility(): Promise<boolean> {
  const result = await call<CreatorEligibilityResponse>('check-creator-eligibility', {});
  return result?.eligible ?? false;
}

export type RestaurantTier = 'starter' | 'growth';

interface RestaurantCheckoutResponse {
  url?: string;
  error?: string;
}

export type RestaurantCheckoutResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Starts a web-based Stripe Checkout session for a restaurant's self-serve
 * subscription tier — open the returned url with `Linking.openURL`, never a
 * native purchase flow (this is B2B spend, not consumer digital content).
 * `commissionPercent` is set once here; a restaurant that already has a
 * locked rate gets back an error directing them to the rate-change-request
 * path instead.
 */
export async function startRestaurantCheckout(
  restaurantId: string,
  tier: RestaurantTier,
  commissionPercent: number,
): Promise<RestaurantCheckoutResult> {
  const result = await call<RestaurantCheckoutResponse>('stripe-restaurant-checkout', {
    restaurantId,
    tier,
    commissionPercent,
  });
  if (!result) return { ok: false, message: 'Something went wrong — try again.' };
  if (result.error || !result.url) return { ok: false, message: result.error ?? 'Something went wrong — try again.' };
  return { ok: true, url: result.url };
}
