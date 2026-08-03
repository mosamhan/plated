/**
 * Foursquare Places proxy.
 *
 * The Foursquare key is billable and used to live in the client as
 * EXPO_PUBLIC_FOURSQUARE_KEY, which Expo inlines into the JS bundle at build
 * time — anyone who downloaded the app could extract it and spend the credits.
 * This function holds the key instead; the client calls here with its user JWT
 * and never sees it.
 *
 * Auth is `requireUser` from _shared/http.ts, not `verify_jwt` — see that file
 * for why the flag isn't the boundary it looks like. Requiring a session is
 * affordable because every screen that searches places already sits behind the
 * auth gate in src/app/(tabs)/_layout.tsx.
 *
 * Deliberately NOT a transparent pass-through: the client sends an operation
 * plus a few narrow values, and this file builds the upstream request. If it
 * forwarded a caller-supplied querystring, a signed-in user could aim the key
 * at any Foursquare endpoint they liked and the proxy would only have moved the
 * problem behind a login.
 *
 * Deploy:  supabase functions deploy places
 * Secret:  supabase secrets set FOURSQUARE_KEY=…
 */

import { CORS, json, requireUser } from '../_shared/http.ts';

const BASE = 'https://places-api.foursquare.com';
const API_VERSION = '2025-06-17';

/**
 * The dining + café/drinks family of Foursquare (legacy-hex) category ids.
 * Lives here rather than in the client so the caller can't widen the scope —
 * the bare "Food" root alone excludes tea rooms and cafés.
 */
const DINING_CATEGORY_IDS = [
  '4d4b7105d754a06374d81259', // Food (root: restaurants)
  '4bf58dd8d48988d1e0931735', // Coffee Shop
  '4bf58dd8d48988d16d941735', // Café
  '4bf58dd8d48988d1dc931735', // Tea Room
  '4bf58dd8d48988d1d0941735', // Dessert Shop
  '4bf58dd8d48988d112941735', // Juice Bar
  '4bf58dd8d48988d16a941735', // Bakery
  '5e18993feee47d000759b256', // Bubble Tea Shop
  // Bagel Shop. The Food root does not reliably cover it: searching "PopUp
  // Bagels" in New York returned that chain 0 times with the list above and 8
  // times with this id added, even though other bagel shops came back fine.
  // Foursquare's root→descendant expansion is inconsistent here, so the
  // category is named outright rather than assumed.
  '4bf58dd8d48988d179941735', // Bagel Shop
].join(',');

/** Foursquare place ids are opaque alphanumeric+dash; anything else is a path-traversal attempt. */
const FSQ_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** "lat,lng" — rejected rather than forwarded, so the upstream never sees junk. */
const LATLNG = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

interface Body {
  op?: string;
  /** 'anywhere' drops the radius; anything else keeps the local fence. */
  scope?: string;
  query?: string;
  near?: string;
  ll?: string;
  fsqId?: string;
}

function upstreamPath(body: Body): string | null {
  const query = (body.query ?? '').trim().slice(0, 200);

  switch (body.op) {
    case 'search': {
      const params = new URLSearchParams({
        query: query || 'restaurant',
        limit: '20',
        fsq_category_ids: DINING_CATEGORY_IDS,
      });
      if (body.ll && LATLNG.test(body.ll)) {
        params.set('ll', body.ll);
        /**
         * The radius is a hard geo-filter, and both behaviours are needed:
         *
         * - Keep it (default) for normal searching. Without it Foursquare wants
         *   a much stronger name match, so partial input collapses — "ip"
         *   returned 3 results with the radius and 0 without, which breaks
         *   type-ahead completely.
         * - Drop it ('anywhere') to reach a named place outside the circle.
         *   With the radius, "Katz's Delicatessen" from Chicago returns local
         *   delis and no Katz's, because the New York one is fenced out.
         *
         * The client runs the fenced pass first and only widens when the local
         * pass didn't turn up what was actually named — see `searchPlaces`.
         */
        if (body.scope !== 'anywhere') params.set('radius', '25000');
      } else {
        params.set('near', (body.near ?? '').trim().slice(0, 120) || 'New York, NY');
      }
      return `/places/search?${params}`;
    }

    case 'autocomplete': {
      if (query.length < 2) return null;
      return `/autocomplete?${new URLSearchParams({ query, types: 'geo', limit: '8' })}`;
    }

    case 'menu': {
      if (!body.fsqId || !FSQ_ID.test(body.fsqId)) return null;
      return `/places/${body.fsqId}?fields=menu`;
    }

    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const key = Deno.env.get('FOURSQUARE_KEY');
  if (!key) return json({ error: 'FOURSQUARE_KEY is not set' }, 500);

  // Spend nobody's credits for a caller who only has the public anon key.
  if (!(await requireUser(req))) return json({ error: 'sign-in required' }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'expected a JSON body' }, 400);
  }

  const path = upstreamPath(body);
  if (!path) return json({ error: `unsupported or malformed op: ${body.op ?? '(none)'}` }, 400);

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'X-Places-Api-Version': API_VERSION,
        Accept: 'application/json',
      },
    });

    // Pass the upstream status through so the client degrades the way it always
    // has — 402 (credits exhausted) and 404 both mean "fall back", not "crash".
    if (!res.ok) return json({ error: 'upstream', status: res.status }, res.status);

    return json(await res.json());
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
