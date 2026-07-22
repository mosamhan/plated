import { Linking, Platform } from 'react-native';

export interface MapPlace {
  name: string;
  location?: string;
  lat?: number;
  lng?: number;
}

const enc = encodeURIComponent;

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

/** Open a reservation search for the restaurant on the given service. */
export function openReservation(provider: 'opentable' | 'resy' | 'search', place: MapPlace) {
  const term = `${place.name} ${place.location ?? ''}`.trim();
  const url =
    provider === 'opentable'
      ? `https://www.opentable.com/s?term=${enc(term)}&covers=2`
      : provider === 'resy'
        ? `https://resy.com/?query=${enc(place.name)}`
        : `https://www.google.com/search?q=${enc(`${term} reservation`)}`;
  Linking.openURL(url).catch(() => {});
}
