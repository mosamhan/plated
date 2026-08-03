/**
 * In-app routing: fetch a driving route from the Google Directions API and
 * decode it into coordinates we can draw as a <Polyline> on the Explore map —
 * so browsing a route keeps the user inside Plated instead of bouncing them
 * out to Apple/Google Maps. (Turn-by-turn navigation still hands off to a maps
 * app, but the preview, distance and ETA live here.)
 *
 * Uses the same Google key as the Maps SDK; the Directions API must be enabled
 * on it (it is, verified against the project key).
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RouteStep {
  /** Plain-text instruction, e.g. "Head south on 8th Ave". */
  instruction: string;
  distanceText: string;
  durationText: string;
  /** Google's maneuver token ("turn-left", "merge", …) when it supplies one. */
  maneuver?: string;
}

export interface RouteResult {
  /** The line to draw, from the user's own position to the destination. */
  coordinates: LatLng[];
  /** Human-readable total distance, e.g. "3.2 mi". */
  distanceText: string;
  /** Human-readable ETA, e.g. "14 min". */
  durationText: string;
  /**
   * Turn-by-turn instructions for reading *before* you drive. Deliberately a
   * list, not live guidance: the Directions API's terms don't permit turn-by-turn
   * navigation, which needs Google's separate Navigation SDK, so actual driving
   * still hands off to a maps app.
   */
  steps: RouteStep[];
}

/**
 * The Directions key is NOT in this bundle — it lives in the `directions` Edge
 * Function (supabase/functions/directions/index.ts). Unlike the native Maps SDK
 * keys, it can't be locked down in Cloud Console either: Directions is a web
 * service API, and those only support IP restrictions, which a phone on a cell
 * network can't satisfy. A proxy is Google's own recommendation for this case.
 *
 * Everything below still parses Google's response shape; only the fetch moved.
 */
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Decode a Google "encoded polyline" string into lat/lng points.
 * (Standard algorithm — https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/**
 * Google returns instructions as HTML ("Head <b>south</b> on <b>8th Ave</b>"),
 * sometimes with a trailing <div> aside like "Destination will be on the left".
 * Flatten it to one readable sentence.
 */
function stripHtml(html: string): string {
  return html
    // The aside is a separate sentence, not a run-on.
    .replace(/<div[^>]*>/gi, '. ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

/**
 * Great-circle kilometres between two points. Separate from `metresBetween`
 * below, which is an equirectangular approximation that's fine over a city but
 * drifts badly at intercontinental range — and explaining *why* a route failed
 * is exactly the case where the two points are far apart.
 */
export function kmBetween(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Metres between two points (equirectangular approximation — fine at city scale). */
function metresBetween(a: LatLng, b: LatLng): number {
  const latRad = ((a.latitude + b.latitude) / 2) * (Math.PI / 180);
  const dx = (b.longitude - a.longitude) * 111320 * Math.cos(latRad);
  const dy = (b.latitude - a.latitude) * 110540;
  return Math.hypot(dx, dy);
}

/**
 * Drop a leading point that's effectively the anchor we're about to prepend, so
 * the line doesn't double back on itself over a few metres.
 */
function dropIfSame(path: LatLng[], anchor: LatLng, end: 'head'): LatLng[] {
  if (end === 'head' && path.length && metresBetween(path[0], anchor) < 15) return path.slice(1);
  return path;
}

/**
 * Why a route couldn't be drawn. Surfaced rather than collapsed into `null`
 * because "there is no road between these two places" and "the service is
 * down" are different problems and deserve different words to the user.
 */
export type RouteFailure =
  /** Google found no drivable road route — different landmass, or no link. */
  | 'unreachable'
  /** Drivable in principle, but longer than Directions will return. */
  | 'too-far'
  /** An endpoint couldn't be matched to the road network at all. */
  | 'not-found'
  /** Quota exhausted (OVER_QUERY_LIMIT / OVER_DAILY_LIMIT). */
  | 'quota'
  /** Key or config problem — REQUEST_DENIED, or Supabase not configured. */
  | 'unavailable'
  /** Network failure, or anything Google didn't name. */
  | 'error';

export type RouteOutcome = { ok: true; route: RouteResult } | { ok: false; reason: RouteFailure };

/** Map Google's `status` onto the reasons the UI knows how to phrase. */
function failureFor(status: string): RouteFailure {
  switch (status) {
    case 'ZERO_RESULTS':
      return 'unreachable';
    case 'MAX_ROUTE_LENGTH_EXCEEDED':
      return 'too-far';
    case 'NOT_FOUND':
      return 'not-found';
    case 'OVER_QUERY_LIMIT':
    case 'OVER_DAILY_LIMIT':
      return 'quota';
    case 'REQUEST_DENIED':
      return 'unavailable';
    default:
      return 'error';
  }
}

/**
 * Fetch a driving route between two points. Reports *why* it failed so the
 * caller can explain it, rather than always saying "try again in a moment" —
 * which is wrong advice when the real answer is that you can't drive there.
 */
export async function fetchRoute(
  origin: LatLng,
  destination: LatLng,
  opts: { avoidTolls?: boolean } = {},
): Promise<RouteOutcome> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'unavailable' };

  try {
    const { data: json, error } = await supabase.functions.invoke<any>('directions', {
      body: {
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
        avoidTolls: opts.avoidTolls === true,
      },
    });
    if (error || !json) {
      if (__DEV__) console.warn('[Plated] directions function failed', error?.message);
      return { ok: false, reason: 'error' };
    }
    if (json.status !== 'OK' || !json.routes?.length) {
      if (__DEV__) console.warn('[Plated] directions failed', json.status, json.error_message);
      return { ok: false, reason: failureFor(json.status) };
    }
    const route = json.routes[0];
    const leg = route.legs?.[0];

    // Per-step geometry, not route.overview_polyline: the overview is a
    // *simplified* line, so at street zoom it visibly cuts corners and its first
    // point can sit a block off. Steps carry the real shape.
    const stepCoords: LatLng[] = (leg?.steps ?? []).flatMap((step: { polyline?: { points?: string } }) =>
      step.polyline?.points ? decodePolyline(step.polyline.points) : [],
    );
    const path = stepCoords.length > 1 ? stepCoords : decodePolyline(route.overview_polyline.points);

    // Google starts and ends the route at the nearest drivable road, which is
    // why the line appeared to begin somewhere other than the user. Anchoring it
    // to the true endpoints makes it run from the location dot to the pin.
    const steps: RouteStep[] = (leg?.steps ?? []).map(
      (step: {
        html_instructions?: string;
        distance?: { text?: string };
        duration?: { text?: string };
        maneuver?: string;
      }) => ({
        instruction: stripHtml(step.html_instructions ?? ''),
        distanceText: step.distance?.text ?? '',
        durationText: step.duration?.text ?? '',
        maneuver: step.maneuver,
      }),
    );

    return {
      ok: true,
      route: {
        coordinates: [origin, ...dropIfSame(path, origin, 'head'), destination],
        distanceText: leg?.distance?.text ?? '',
        durationText: leg?.duration?.text ?? '',
        steps,
      },
    };
  } catch (e) {
    if (__DEV__) console.warn('[Plated] directions threw', e);
    return { ok: false, reason: 'error' };
  }
}
