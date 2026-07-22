import { Ionicons } from '@expo/vector-icons';
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import type { LatLng } from '@/lib/directions';
import { mapStyleDark, mapStyleLight } from '@/lib/mapStyles';
import { RestaurantWithRating } from '@/store/DataContext';

/** Per-place relationship, driving the pin's color + glyph (design §1). */
export type PinCategory = 'loved' | 'been' | 'dining';

export const PIN_META: Record<PinCategory, { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  loved: { color: '#E4483B', icon: 'heart', label: 'Loved' },
  been: { color: '#2E9E63', icon: 'checkmark', label: 'Been there' },
  dining: { color: '#251B10', icon: 'restaurant', label: 'Fine dining' },
};

export interface MapRestaurant extends RestaurantWithRating {
  lat: number;
  lng: number;
  category: PinCategory;
  saved: boolean;
}

interface Props {
  restaurants: MapRestaurant[];
  region: Region;
  mapTheme: 'light' | 'dark';
  onSelect: (r: MapRestaurant) => void;
  onRegionChange?: (r: Region) => void;
  /** When set, a route line is drawn on top of the pins (in-app routing). */
  routeCoords?: LatLng[];
  routeColor?: string;
}

/**
 * The Explore map: a Google-provider MapView with a custom Plated style and a
 * pill marker per restaurant (category-colored dot + score, gold ★ when saved),
 * per design/handoff/README.md §1. Recreated natively — no Leaflet/OSM.
 *
 * Forwards a ref to the underlying MapView so the screen can animate to a pin
 * or fit the camera to a drawn route (fitToCoordinates).
 */
export const ExploreMap = forwardRef<MapView, Props>(function ExploreMap(
  { restaurants, region, mapTheme, onSelect, onRegionChange, routeCoords, routeColor = '#B07207' },
  ref,
) {
  const style = mapTheme === 'dark' ? mapStyleDark : mapStyleLight;

  return (
    <MapView
      ref={ref}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      customMapStyle={style}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      onRegionChangeComplete={onRegionChange}>
      {restaurants.map((r) => (
        <Marker
          key={r.id}
          coordinate={{ latitude: r.lat, longitude: r.lng }}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
          onPress={() => onSelect(r)}>
          <Pin category={r.category} score={r.platedRating} saved={r.saved} />
        </Marker>
      ))}
      {routeCoords && routeCoords.length > 1 && (
        <Polyline coordinates={routeCoords} strokeColor={routeColor} strokeWidth={5} lineCap="round" lineJoin="round" />
      )}
    </MapView>
  );
});

function Pin({ category, score, saved }: { category: PinCategory; score: number; saved: boolean }) {
  const meta = PIN_META[category];
  return (
    <View style={[styles.pin, { borderColor: saved ? '#B07207' : '#fff' }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]}>
        <Ionicons name={meta.icon} size={12} color="#fff" />
      </View>
      <Text style={styles.score}>{score > 0 ? score.toFixed(1) : '—'}</Text>
      {saved && <Ionicons name="star" size={11} color="#B07207" style={{ marginLeft: -1 }} />}
    </View>
  );
}

/** Derive a restaurant's map category from the user's relationship with it. */
export function deriveCategory(opts: { saved: boolean; rated: boolean; priceLevel?: string }): PinCategory {
  if (opts.saved) return 'loved';
  if (opts.rated) return 'been';
  return 'dining';
}

// Marker views are white-on-tinted-land, so hardcode the light chrome (they sit
// on the map, not the app surface) — only the score text tracks nothing here.
const styles = StyleSheet.create({
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFDF8',
    paddingLeft: 4,
    paddingRight: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 2,
    shadowColor: '#251B10',
    shadowOpacity: 0.32,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  score: { color: '#1A1413', fontSize: 13, fontWeight: '800' },
});
