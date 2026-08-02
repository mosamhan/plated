/**
 * Google Directions proxy.
 *
 * Same reason as the `places` function, but with a sharper edge: the Directions
 * API is a *web service* API, and Google's application restrictions (iOS bundle
 * id, Android, HTTP referrer) don't apply to those — only IP restrictions do,
 * which a phone on a cell network can never satisfy. So unlike the native Maps
 * SDK keys, this one cannot be locked down in Cloud Console at all. Google's own
 * security guidance says to put a proxy in front of it, which is this file.
 *
 * Returns Google's response as-is. All the parsing — polyline decoding, HTML
 * stripping, endpoint anchoring — stays in src/lib/directions.ts, so this stays
 * a thin key-holder and route shape changes don't need a redeploy.
 *
 * Deploy:  supabase functions deploy directions
 * Secret:  supabase secrets set GOOGLE_DIRECTIONS_KEY=…
 */

import { CORS, coord, json, requireUser } from '../_shared/http.ts';

const BASE = 'https://maps.googleapis.com/maps/api/directions/json';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const key = Deno.env.get('GOOGLE_DIRECTIONS_KEY');
  if (!key) return json({ error: 'GOOGLE_DIRECTIONS_KEY is not set' }, 500);

  if (!(await requireUser(req))) return json({ error: 'sign-in required' }, 401);

  let body: { origin?: unknown; destination?: unknown; avoidTolls?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'expected a JSON body' }, 400);
  }

  const origin = coord(body.origin);
  const destination = coord(body.destination);
  if (!origin || !destination) return json({ error: 'origin and destination must be {lat,lng}' }, 400);

  // Mode is fixed to driving: the client only ever asks for a drive, and leaving
  // it caller-controlled would widen what this key can be spent on for nothing.
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode: 'driving',
    key,
  });
  if (body.avoidTolls === true) params.set('avoid', 'tolls');

  try {
    const res = await fetch(`${BASE}?${params}`);
    if (!res.ok) return json({ error: 'upstream', status: res.status }, res.status);
    // Google signals its own failures in a 200 body (`status: ZERO_RESULTS`),
    // which the client already reads — pass the body straight through.
    return json(await res.json());
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
