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

export interface RouteResult {
  /** Decoded overview polyline — the line to draw on the map. */
  coordinates: LatLng[];
  /** Human-readable total distance, e.g. "3.2 mi". */
  distanceText: string;
  /** Human-readable ETA, e.g. "14 min". */
  durationText: string;
}

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';

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
 * Fetch a driving route between two points. Returns null on any failure so the
 * caller can fall back gracefully (e.g. offer "open in Maps" instead).
 */
export async function fetchRoute(
  origin: LatLng,
  destination: LatLng,
  opts: { avoidTolls?: boolean } = {},
): Promise<RouteResult | null> {
  if (!KEY) return null;
  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    mode: 'driving',
    key: KEY,
  });
  if (opts.avoidTolls) params.set('avoid', 'tolls');

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
    const json = await res.json();
    if (json.status !== 'OK' || !json.routes?.length) {
      if (__DEV__) console.warn('[Plated] directions failed', json.status, json.error_message);
      return null;
    }
    const route = json.routes[0];
    const leg = route.legs?.[0];
    return {
      coordinates: decodePolyline(route.overview_polyline.points),
      distanceText: leg?.distance?.text ?? '',
      durationText: leg?.duration?.text ?? '',
    };
  } catch (e) {
    if (__DEV__) console.warn('[Plated] directions threw', e);
    return null;
  }
}
