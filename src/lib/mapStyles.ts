/**
 * Google Maps custom style JSON for the Explore map, per design/handoff §1.
 * Light = warm cream land (#F3EBD9), muted parks, near-white roads; Dark =
 * charcoal (#14120F). Applied via <MapView customMapStyle> (provider=google),
 * not a CSS tile filter (that was a web-prototype-only hack).
 *
 * Kept intentionally minimal — a full Google style has dozens of feature
 * selectors; these hit the elements that read as "Plated": land, water, parks,
 * roads, and label legibility against the tinted land.
 */
import type { MapStyleElement } from 'react-native-maps';

export const mapStyleLight: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F3EBD9' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8C7B61' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFDF8' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#DCE4C8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFDF8' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#EFE3CC' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F6D9A8' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#E9C486' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#BFD4D1' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7DA' }] },
];

export const mapStyleDark: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#14120F' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A99F8C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14120F' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1E2416' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#221C14' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#33291B' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3A2C15' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0E1A1B' }] },
];
