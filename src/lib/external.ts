import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

export interface MapPlace {
  name: string;
  location?: string;
  lat?: number;
  lng?: number;
}

const enc = encodeURIComponent;

/**
 * Open a URL in an in-app browser (keeps the user in Plated) instead of
 * bouncing out to Safari/an external app. Falls back to Linking if the
 * in-app browser can't open it.
 */
async function openInApp(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
  } catch {
    Linking.openURL(url).catch(() => {});
  }
}

/** Open turn-by-turn directions in Apple or Google Maps. */
export function openDirections(provider: 'apple' | 'google', place: MapPlace, opts: { avoidTolls?: boolean } = {}) {
  const dest = place.lat != null && place.lng != null ? `${place.lat},${place.lng}` : `${place.name} ${place.location ?? ''}`.trim();
  const url =
    provider === 'apple'
      ? // Apple Maps: dirflg=t adds tolls to the avoid set.
        `http://maps.apple.com/?daddr=${enc(dest)}&q=${enc(place.name)}${opts.avoidTolls ? '&dirflg=t' : ''}`
      : `https://www.google.com/maps/dir/?api=1&destination=${enc(dest)}${opts.avoidTolls ? '&avoid=tolls' : ''}`;
  Linking.openURL(url).catch(() => {});
}

/** Open the device's default maps app showing the place. */
export function openMap(place: MapPlace) {
  openDirections(Platform.OS === 'android' ? 'google' : 'apple', place);
}

/**
 * Open a reservation search for the restaurant in an in-app browser so the user
 * stays in Plated. The default ('search') is a Google reservation lookup —
 * it always loads (OpenTable's `/s?term=` deep link intermittently returns an
 * "access denied" bot page in an embedded browser) and surfaces the venue's
 * OpenTable/Resy/Tock listing as the top hit. The explicit provider options
 * still deep-link their own sites for users who prefer them.
 */
export function openReservation(provider: 'opentable' | 'resy' | 'search', place: MapPlace) {
  const term = `${place.name} ${place.location ?? ''}`.trim();
  const url =
    provider === 'opentable'
      ? `https://www.opentable.com/s?term=${enc(term)}&covers=2`
      : provider === 'resy'
        ? `https://www.google.com/search?q=${enc(`${place.name} resy reservation`)}`
        : `https://www.google.com/search?q=${enc(`${term} reservation`)}`;
  openInApp(url);
}
