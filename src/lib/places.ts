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

async function runSearch(body: {
  query: string;
  ll?: string;
  near?: string;
  scope?: 'nearby' | 'anywhere';
}): Promise<PlaceResult[]> {
  // Limit and the dining category scope are fixed by the Edge Function so a
  // caller can't widen them; only the query and where-to-look travel.
  const json = await callPlaces<{ results?: FsqPlace[] }>({ op: 'search', ...body });
  if (!json) return [];
  return (json.results ?? []).map(normalize).filter((r) => r.fsqId);
}

/** Lowercase, punctuation-free, single-spaced — for comparing names to input. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Search restaurants: local first, widening only when the local pass didn't
 * find what was named, and ranked so the closest match to what was typed leads.
 *
 * The local pass keeps Foursquare's radius, because dropping it makes the API
 * demand a much stronger name match and partial input stops returning anything
 * ("ip" → 3 results fenced, 0 unfenced). Type-ahead depends on it.
 *
 * The widening pass drops the radius, because the radius is a hard filter and a
 * place outside it is invisible — "Katz's Delicatessen" from Chicago otherwise
 * returns local delis and never the New York one. It's skipped whenever the
 * local pass already contains a name matching the query, so ordinary searches
 * cost exactly one request and are unchanged.
 *
 * Last resort, only when both passes come back empty: treat the trailing word
 * as a place hint ("Ichiran Shibuya" → query "Ichiran", near "Shibuya"). The
 * `ll` bias doesn't reach across continents, and passing the whole query as
 * `near` doesn't work — Foursquare geocodes it, then matches the venue name
 * against the area and returns unrelated places.
 */
export async function searchPlaces(
  query: string,
  opts: { near?: string; ll?: string } = {},
): Promise<PlaceResult[]> {
  const q = norm(query);
  const nearby = await runSearch({ query, ll: opts.ll, near: opts.near, scope: 'nearby' });

  // "Did we find the thing they named?" — a substring match on the whole query,
  // not per-word, so "Katz's Delicatessen" isn't satisfied by any old deli.
  const foundNamed = q.length > 0 && nearby.some((r) => norm(r.name).includes(q));

  let merged = nearby;
  if (!foundNamed && q.length >= 4) {
    const wider = await runSearch({ query, ll: opts.ll, near: opts.near, scope: 'anywhere' });
    const seen = new Set(nearby.map((r) => r.fsqId));
    merged = [...nearby, ...wider.filter((r) => !seen.has(r.fsqId))];
  }

  if (merged.length === 0) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return merged;
    return runSearch({ query: words.slice(0, -1).join(' '), near: words[words.length - 1] });
  }

  // Closest match to the input first. A stable partition, so within each group
  // Foursquare's own ranking (which is proximity-aware) is preserved.
  const scored = merged.map((r, i) => {
    const n = norm(r.name);
    const rank = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3;
    return { r, rank, i };
  });
  scored.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return scored.map((s) => s.r);
}
