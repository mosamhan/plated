/**
 * Foursquare Places — real restaurant search.
 *
 * Restaurant identity/location comes from Foursquare; the dishes, photos, and
 * ratings are Plated's own user-generated content. Foursquare's terms allow
 * persisting a place once a user references it, so we save it to our DB on the
 * first plate added there.
 *
 * The Foursquare key is NOT in this bundle. Every call goes through the
 * `places` Edge Function (supabase/functions/places/index.ts), which holds the
 * key and decides what upstream request to make — `EXPO_PUBLIC_` vars are
 * inlined into the shipped JS, so a billable key can't live out here.
 *
 * Failure behaviour is unchanged: everything degrades to an empty result rather
 * than throwing, so callers fall back to seeded data exactly as before.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Places now ride on Supabase, so that's the only thing left to be configured. */
export const isPlacesConfigured = isSupabaseConfigured;

/**
 * One hop to the proxy. Returns null on any failure — a missing session, a
 * non-2xx from the function, an exhausted-credits 402 upstream — because every
 * caller here treats "no data" and "request failed" the same way.
 */
async function callPlaces<T>(body: Record<string, unknown>): Promise<T | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.functions.invoke<T>('places', { body });
    if (error) {
      if (__DEV__) console.warn('[Plated] places function failed', body.op, error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    if (__DEV__) console.warn('[Plated] places request error', e);
    return null;
  }
}

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
  if (!fsqId) return [];
  // 402 (no credits) / 404 / a tier without the menu field all arrive as null.
  const json = await callPlaces<{
    menu?: { items?: { name?: string }[]; sections?: { items?: { name?: string }[] }[] };
  }>({ op: 'menu', fsqId });
  if (!json) return [];
  const flat: string[] = [];
  for (const it of json.menu?.items ?? []) if (it.name) flat.push(it.name);
  for (const sec of json.menu?.sections ?? []) for (const it of sec.items ?? []) if (it.name) flat.push(it.name);
  return Array.from(new Set(flat));
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
  if (q.length < 2) return [];
  const json = await callPlaces<{ results?: any[] }>({ op: 'autocomplete', query: q });
  if (!json) return [];
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
  // Limit, radius, and the dining category scope are fixed by the Edge Function
  // so a caller can't widen them; only the query and where-to-look travel.
  const json = await callPlaces<{ results?: FsqPlace[] }>({
    op: 'search',
    query,
    ll: opts.ll,
    near: opts.near,
  });
  if (!json) return [];
  return (json.results ?? []).map(normalize).filter((r) => r.fsqId);
}
