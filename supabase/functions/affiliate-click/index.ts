/**
 * Records an affiliate click and returns the URL to hand off to.
 *
 * Called right before OrderProviderSheet opens DoorDash/Uber Eats/a pickup
 * search — see its comment: "production appends subId1=creatorId,
 * subId2=plateId, subId3=sessionId for affiliate-network tracking." This is
 * that production path. It runs server-side (not client-inline) for two
 * reasons: inserting into `affiliate_clicks` needs service_role (the table has
 * no client insert policy — see 0027_creator_earnings.sql), and the affiliate
 * network's campaign URL template is a business detail that shouldn't ship in
 * the app bundle any more than the Foursquare key does (see `places`).
 *
 * Until a real network is connected, TRACKING_URL_TEMPLATE env vars are unset
 * and this simply returns the destination URL unchanged with a click recorded
 * — safe to call from day one, real tracking turns on by setting a secret.
 *
 * Deploy:  supabase functions deploy affiliate-click
 * Secrets (optional until Impact.com/CJ enrollment is live):
 *   supabase secrets set IMPACT_DOORDASH_TRACKING_URL_TEMPLATE='https://…?u={u}&subId1={s1}&subId2={s2}&subId3={s3}'
 *   supabase secrets set IMPACT_UBEREATS_TRACKING_URL_TEMPLATE='https://…?u={u}&subId1={s1}&subId2={s2}&subId3={s3}'
 *   ({u} = urlencoded destination, {s1} = creatorId, {s2} = orderId, {s3} = click_token)
 */

import { CORS, json, requireUser, serviceClient } from '../_shared/http.ts';

type Platform = 'doordash' | 'ubereats' | 'pickup';

const ALLOWED_HOSTS: Record<Platform, string[]> = {
  doordash: ['doordash.com'],
  ubereats: ['ubereats.com'],
  pickup: ['google.com'],
};

const TRACKING_TEMPLATE_ENV: Partial<Record<Platform, string>> = {
  doordash: 'IMPACT_DOORDASH_TRACKING_URL_TEMPLATE',
  ubereats: 'IMPACT_UBEREATS_TRACKING_URL_TEMPLATE',
  // No affiliate program wraps a plain Google search — pickup always passes through.
};

interface Body {
  restaurantId?: string;
  orderId?: string;
  creatorId?: string;
  platform?: string;
  destinationUrl?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidDestination(platform: Platform, raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_HOSTS[platform].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function buildTrackingUrl(template: string, opts: { destination: string; creatorId: string; orderId: string; clickToken: string }): string {
  return template
    .replaceAll('{u}', encodeURIComponent(opts.destination))
    .replaceAll('{s1}', encodeURIComponent(opts.creatorId))
    .replaceAll('{s2}', encodeURIComponent(opts.orderId))
    .replaceAll('{s3}', encodeURIComponent(opts.clickToken));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const user = await requireUser(req);
  if (!user) return json({ error: 'sign-in required' }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'expected a JSON body' }, 400);
  }

  const platform = body.platform as Platform;
  if (!['doordash', 'ubereats', 'pickup'].includes(platform ?? '')) {
    return json({ error: 'unsupported platform' }, 400);
  }
  if (!body.restaurantId || !UUID.test(body.restaurantId)) {
    return json({ error: 'restaurantId required' }, 400);
  }
  if (body.orderId && !UUID.test(body.orderId)) return json({ error: 'malformed orderId' }, 400);
  if (body.creatorId && !UUID.test(body.creatorId)) return json({ error: 'malformed creatorId' }, 400);
  if (!body.destinationUrl || !isValidDestination(platform, body.destinationUrl)) {
    return json({ error: 'destinationUrl missing or not a recognized provider domain' }, 400);
  }

  // Plated never pays a creator for ordering their own food — mirrors the
  // check constraint on affiliate_clicks, checked here too so we can drop the
  // credit instead of failing the whole hand-off.
  let creatorId = body.creatorId && body.creatorId !== user.id ? body.creatorId : null;

  const db = serviceClient();

  // Only a compensation_eligible creator can be credited — the same gate the
  // dashboard's "Path to payouts" screen enforces client-side. Checked here
  // too because this is the one place a credit actually gets written; a click
  // still gets recorded (creator_id null) so a plate's traffic isn't lost the
  // moment its creator crosses out of eligibility.
  if (creatorId) {
    const { data: creator } = await db
      .from('profiles')
      .select('compensation_eligible')
      .eq('id', creatorId)
      .maybeSingle();
    if (!creator?.compensation_eligible) creatorId = null;
  }

  const { data: click, error } = await db
    .from('affiliate_clicks')
    .insert({
      user_id: user.id,
      creator_id: creatorId,
      order_id: body.orderId ?? null,
      restaurant_id: body.restaurantId,
      platform,
    })
    .select('click_token')
    .single();

  if (error || !click) {
    console.error('[affiliate-click] insert failed', error);
    return json({ error: 'could not record click' }, 500);
  }

  const templateEnv = TRACKING_TEMPLATE_ENV[platform];
  const template = templateEnv ? Deno.env.get(templateEnv) : null;

  const url = template && creatorId
    ? buildTrackingUrl(template, {
        destination: body.destinationUrl,
        creatorId,
        orderId: body.orderId ?? '',
        clickToken: click.click_token,
      })
    : body.destinationUrl;

  return json({ url, clickToken: click.click_token });
});
