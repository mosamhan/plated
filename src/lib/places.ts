/**
 * Foursquare Places — real restaurant search.
 *
 * Restaurant identity/location comes from Foursquare; the dishes, photos, and
 * ratings are Plated's own user-generated content. Foursquare's terms allow
 * persisting a place once a user references it, so we save it to our DB on the
 * first plate added there.
 *
 * NOTE: the key is read from EXPO_PUBLIC_FOURSQUARE_KEY (bundled in the client).
 * Before public launch, move this call behind a Supabase Edge Function so the
 * key stays server-side — see SUPABASE_SETUP.md.
 */

const KEY = process.env.EXPO_PUBLIC_FOURSQUARE_KEY;
const BASE = 'https://places-api.foursquare.com';
const API_VERSION = '2025-06-17';

/**
 * The full dining + café/drinks family of Foursquare (legacy-hex) category ids.
 * Scopes search to food & drink venues — restaurants AND cafés, coffee, tea
 * rooms, dessert, juice/smoothie, bakeries, bubble tea — so Plated covers
 * drinks and cafés (like Beli), not just sit-down restaurants. (The bare
 * "Food" root alone excludes tea rooms/cafés, which hid places like
 * "Match A | Tea Room".)
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
].join(',');

export const isPlacesConfigured = Boolean(KEY);

export interface PlaceResult {
  fsqId: string;
  name: string;
  cuisine: string;
  location: string;
  lat?: number;
  lng?: number;
  priceLevel?: string;
}

function priceToTier(price?: number): string | undefined {
  if (!price) return undefined;
  return '$'.repeat(Math.max(1, Math.min(4, price)));
}

interface FsqPlace {
  fsq_place_id?: string;
  fsq_id?: string;
  name: string;
  categories?: { name?: string; short_name?: string }[];
  location?: { formatted_address?: string; locality?: string; region?: string };
  latitude?: number;
  longitude?: number;
  geocodes?: { main?: { latitude: number; longitude: number } };
  price?: number;
}

function normalize(p: FsqPlace): PlaceResult {
  const geo = p.geocodes?.main;
  return {
    fsqId: p.fsq_place_id ?? p.fsq_id ?? '',
    name: p.name,
    cuisine: p.categories?.[0]?.short_name ?? p.categories?.[0]?.name ?? 'Restaurant',
    location:
      p.location?.locality && p.location?.region
        ? `${p.location.locality}, ${p.location.region}`
        : p.location?.formatted_address ?? '',
    lat: p.latitude ?? geo?.latitude,
    lng: p.longitude ?? geo?.longitude,
    priceLevel: priceToTier(p.price),
  };
}

/**
 * Best-effort structured menu from Foursquare's premium menu field. This is the
 * "API" half of the hybrid menu (the crowd-sourced half lives in DataContext's
 * menuForRestaurant). Returns [] whenever the field is absent, the tier doesn't
 * include it, or credits are exhausted — the crowd-sourced menu then stands
 * alone. Requires an fsqId (only available for Foursquare-backed restaurants).
 */
export async function fetchMenuItems(fsqId: string): Promise<string[]> {
  if (!KEY || !fsqId) return [];
  try {
    const res = await fetch(`${BASE}/places/${fsqId}?fields=menu`, {
      headers: {
        Authorization: `Bearer ${KEY}`,
        'X-Places-Api-Version': API_VERSION,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return []; // 402 (no credits) / 404 / tier without menu → degrade
    const json = (await res.json()) as { menu?: { items?: { name?: string }[]; sections?: { items?: { name?: string }[] }[] } };
    const flat: string[] = [];
    for (const it of json.menu?.items ?? []) if (it.name) flat.push(it.name);
    for (const sec of json.menu?.sections ?? []) for (const it of sec.items ?? []) if (it.name) flat.push(it.name);
    return Array.from(new Set(flat));
  } catch {
    return [];
  }
}

export interface PlaceSuggestion {
  id: string;
  /** Primary label, e.g. "Chicago". */
  label: string;
  /** Secondary context, e.g. "IL, United States". */
  detail: string;
  lat?: number;
  lng?: number;
}

/**
 * Type-ahead location autocomplete (cities / neighborhoods) for the location
 * picker. Returns geo suggestions with their center coordinates so selecting
 * one sets both the label AND lat/lng (needed for map routing & "near me").
 * Returns [] on missing key / failure so the caller can degrade gracefully.
 */
export async function autocompleteLocations(query: string): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!KEY || q.length < 2) return [];
  const params = new URLSearchParams({ query: q, types: 'geo', limit: '8' });
  try {
    const res = await fetch(`${BASE}/autocomplete?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${KEY}`,
        'X-Places-Api-Version': API_VERSION,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      if (__DEV__) console.warn('[Plated] autocomplete failed', res.status);
      return [];
    }
    const json = (await res.json()) as { results?: any[] };
    return (json.results ?? [])
      .map((r, i): PlaceSuggestion | null => {
        const center = r.geo?.center;
        const primary = r.text?.primary ?? r.geo?.name;
        if (!primary) return null;
        // Foursquare's `secondary` here is a "Search for …" prompt, not a real
        // subtitle; primary already carries the region (e.g. "Chicago, IL").
        return {
          id: `${primary}-${i}`,
          label: primary,
          detail: r.geo?.cc && r.geo.cc !== 'US' ? r.geo.cc : '',
          lat: center?.latitude,
          lng: center?.longitude,
        };
      })
      .filter((s): s is PlaceSuggestion => s != null && s.lat != null);
  } catch (e) {
    if (__DEV__) console.warn('[Plated] autocomplete error', e);
    return [];
  }
}

/**
 * Search restaurants near a place string (e.g. "New York, NY") or lat/lng.
 * Returns [] (and logs) if the key is missing or the request fails, so callers
 * can fall back to seeded data gracefully.
 */
export async function searchPlaces(
  query: string,
  opts: { near?: string; ll?: string } = {},
): Promise<PlaceResult[]> {
  if (!KEY) return [];
  const params = new URLSearchParams({
    query: query || 'restaurant',
    limit: '20',
    // Scope to restaurants AND cafés/drinks (not just the "Food" root).
    fsq_category_ids: DINING_CATEGORY_IDS,
  });
  if (opts.ll) {
    params.set('ll', opts.ll);
    // Cover the whole metro (25km) so a named spot a few miles away still shows.
    params.set('radius', '25000');
  } else {
    params.set('near', opts.near || 'New York, NY');
  }

  try {
    const res = await fetch(`${BASE}/places/search?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${KEY}`,
        'X-Places-Api-Version': API_VERSION,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      if (__DEV__) console.warn('[Plated] Foursquare search failed', res.status, await res.text());
      return [];
    }
    const json = (await res.json()) as { results?: FsqPlace[] };
    return (json.results ?? []).map(normalize).filter((r) => r.fsqId);
  } catch (e) {
    if (__DEV__) console.warn('[Plated] Foursquare request error', e);
    return [];
  }
}
