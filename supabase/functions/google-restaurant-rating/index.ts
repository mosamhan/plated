/**
 * Google's public rating (out of 5) for a restaurant, shown next to Plated's
 * own 0-10 average on the restaurant detail sheet — cached on `restaurants`
 * (0045_google_rating_cache.sql) rather than fetched live on every view,
 * since Google's Places API is billed per lookup and a place's Google rating
 * doesn't meaningfully change minute to minute. The client only calls this
 * when its cached copy is missing or stale (>30 days).
 *
 * Uses the legacy "Find Place From Text" Places API (a text query — the
 * restaurant's name + location — rather than needing Google's own place id
 * up front). Same key-exposure posture as `directions`: this is a web-service
 * API, so Google's application-restriction options (bundle id, etc.) don't
 * apply to it — only IP restriction does, which a phone on a cell network
 * can never satisfy. Proxying it through this function is Google's own
 * recommended mitigation, same reason `directions` exists.
 *
 * Deploy:  supabase functions deploy google-restaurant-rating
 * Secret:  supabase secrets set GOOGLE_PLACES_KEY=…
 *          (falls back to GOOGLE_DIRECTIONS_KEY if that's the only Google
 *          Maps Platform key set up and Places API is enabled on it too)
 */

import { CORS, json, requireUser, serviceClient } from '../_shared/http.ts';

const FIND_PLACE_URL = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const key = Deno.env.get('GOOGLE_PLACES_KEY') ?? Deno.env.get('GOOGLE_DIRECTIONS_KEY');
  if (!key) return json({ error: 'GOOGLE_PLACES_KEY is not set' }, 500);

  const user = await requireUser(req);
  if (!user) return json({ error: 'sign-in required' }, 401);

  const body = await req.json().catch(() => ({}));
  const restaurantId = typeof body.restaurantId === 'string' ? body.restaurantId : null;
  if (!restaurantId) return json({ error: 'restaurantId is required' }, 400);

  const db = serviceClient();

  const { data: restaurant } = await db
    .from('restaurants')
    .select('name, location, google_place_id, google_rating, google_rating_count, google_rating_fetched_at')
    .eq('id', restaurantId)
    .maybeSingle();
  if (!restaurant) return json({ error: 'restaurant not found' }, 404);

  const fresh =
    restaurant.google_rating_fetched_at &&
    Date.now() - new Date(restaurant.google_rating_fetched_at).getTime() < STALE_AFTER_MS;
  if (fresh) {
    return json({
      googlePlaceId: restaurant.google_place_id,
      googleRating: restaurant.google_rating,
      googleRatingCount: restaurant.google_rating_count,
    });
  }

  // Find Place From Text — resolves a name+location query to a single best-match
  // place id without the client (or us) ever needing Google's id up front.
  let placeId = restaurant.google_place_id as string | null;
  if (!placeId) {
    const query = `${restaurant.name} ${restaurant.location ?? ''}`.trim();
    const findParams = new URLSearchParams({
      input: query,
      inputtype: 'textquery',
      fields: 'place_id',
      key,
    });
    const findRes = await fetch(`${FIND_PLACE_URL}?${findParams}`);
    const findData = await findRes.json();
    if (findData.status !== 'OK' || !findData.candidates?.[0]?.place_id) {
      // No match — cache the miss too (as "checked, nothing found") so we
      // don't retry every single time this restaurant's sheet opens.
      await db
        .from('restaurants')
        .update({ google_rating_fetched_at: new Date().toISOString() })
        .eq('id', restaurantId);
      return json({ googlePlaceId: null, googleRating: null, googleRatingCount: null });
    }
    placeId = findData.candidates[0].place_id;
  }

  const detailsParams = new URLSearchParams({
    place_id: placeId!,
    fields: 'rating,user_ratings_total',
    key,
  });
  const detailsRes = await fetch(`${DETAILS_URL}?${detailsParams}`);
  const detailsData = await detailsRes.json();
  const rating = detailsData.result?.rating ?? null;
  const ratingCount = detailsData.result?.user_ratings_total ?? null;

  const { error } = await db
    .from('restaurants')
    .update({
      google_place_id: placeId,
      google_rating: rating,
      google_rating_count: ratingCount,
      google_rating_fetched_at: new Date().toISOString(),
    })
    .eq('id', restaurantId);
  if (error) console.error('[google-restaurant-rating] cache write failed', error);

  return json({ googlePlaceId: placeId, googleRating: rating, googleRatingCount: ratingCount });
});
