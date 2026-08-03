import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import type { LatLng } from '@/lib/directions';
import { mapStyleDark, mapStyleLight } from '@/lib/mapStyles';
import type { PlaceStatus, PlaceType } from '@/lib/placeType';
import { RestaurantWithRating } from '@/store/DataContext';

/** Icon names come from MaterialCommunityIcons — see `MciName`. */
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * A pin carries two independent things: the **glyph** says what kind of place
 * it is, the **colour** says how you relate to it. They used to be one enum,
 * which forced a choice — a loved pizzeria could be "Loved" or "Pizza" but not
 * both, and filtering for one hid the other.
 *
 * MaterialCommunityIcons rather than Ionicons: Ionicons has no noodle bowl, no
 * taco and no steak, so the food types were landing on stand-ins (ramen was an
 * apple). This set has a real glyph for each one.
 */
export const PLACE_TYPE_META: Record<PlaceType, { icon: MciName; label: string }> = {
  cafe: { icon: 'coffee', label: 'Café & drinks' },
  bakery: { icon: 'cupcake', label: 'Bakery & dessert' },
  bar: { icon: 'glass-cocktail', label: 'Bar' },
  pizza: { icon: 'pizza', label: 'Pizza' },
  sushi: { icon: 'rice', label: 'Sushi & Japanese' },
  ramen: { icon: 'noodles', label: 'Ramen & noodles' },
  burgers: { icon: 'hamburger', label: 'Burgers' },
  mexican: { icon: 'taco', label: 'Tacos & Mexican' },
  italian: { icon: 'pasta', label: 'Italian' },
  french: { icon: 'glass-wine', label: 'French & fine dining' },
  steakhouse: { icon: 'food-steak', label: 'Steakhouse & BBQ' },
  seafood: { icon: 'fish', label: 'Seafood' },
  midEast: { icon: 'food-drumstick', label: 'Halal & Middle Eastern' },
  vegan: { icon: 'leaf', label: 'Vegan & salads' },
  other: { icon: 'storefront-outline', label: 'Everything else' },
};

/**
 * The types offered as filters. 'other' is deliberately absent: with no filter
 * selected everything already shows, so a catch-all chip only exists to be
 * turned *off*, which is a confusing way to express "hide the unclassified".
 */
export const FILTERABLE_PLACE_TYPES = (Object.keys(PLACE_TYPE_META) as PlaceType[]).filter(
  (t) => t !== 'other',
);

/** Colour by status, highest priority first — a place can hold several. */
export const STATUS_META: Record<PlaceStatus, { color: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  loved: { color: '#E4483B', icon: 'heart', label: 'Loved' },
  saved: { color: '#B07207', icon: 'bookmark', label: 'Saved' },
  been: { color: '#2E9E63', icon: 'checkmark', label: 'Been there' },
};

/** Neutral pin colour for a place you have no history with. */
const NEUTRAL_PIN = '#8B5E34';

export const STATUS_ORDER: PlaceStatus[] = ['loved', 'saved', 'been'];

/** The colour a pin takes: strongest status wins, neutral when there's none. */
export function pinColorFor(statuses: PlaceStatus[]): string {
  const top = STATUS_ORDER.find((s) => statuses.includes(s));
  return top ? STATUS_META[top].color : NEUTRAL_PIN;
}

export interface MapRestaurant extends RestaurantWithRating {
  lat: number;
  lng: number;
  type: PlaceType;
  statuses: PlaceStatus[];
  saved: boolean;
}

interface Props {
  restaurants: MapRestaurant[];
  region: Region;
  mapTheme: 'light' | 'dark';
  onSelect: (r: MapRestaurant) => void;
  /** Pin to emphasise — the restaurant behind the plate you just tapped. */
  highlightedId?: string | null;
  onRegionChange?: (r: Region) => void;
  /**
   * Where the user is. Rendered as Plated's own dot rather than the system blue
   * one — it's the anchor of a drawn route, so it should read as ours.
   */
  userLocation?: LatLng | null;
  /**
   * A place that isn't on Plated yet, being looked at from search. Drawn as an
   * outlined pin so it reads as "not one of ours — not rated yet".
   */
  previewPlace?: { latitude: number; longitude: number; name: string } | null;
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
/**
 * Expo Go can't apply the react-native-maps config plugin, so the Google
 * provider has no API key there and renders a blank grey rectangle. Falling
 * back to the platform default (Apple Maps on iOS) keeps the map usable while
 * developing in Expo Go; dev and store builds still get Google + Plated's
 * custom style.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * How much a pin says, by zoom. Zoomed out, a city's worth of pins only needs to
 * show *where* things are — scores and names at that density are unreadable
 * overlapping noise. Zooming in is the request for detail, so the pin earns its
 * score, then its name.
 */
type PinDetail = 'far' | 'mid' | 'near';

/** The user marker's fixed frame — see the note on `userWrap`. */
const PULSE_SIZE = 88;

const detailFor = (latitudeDelta: number): PinDetail => {
  // Tuned against the default city view (delta ~0.09): at that zoom five pins
  // already overlap, so it has to be the dot tier, not the score tier.
  if (latitudeDelta > 0.055) return 'far';
  if (latitudeDelta > 0.018) return 'mid';
  return 'near';
};

export const ExploreMap = forwardRef<MapView, Props>(function ExploreMap(
  {
    restaurants,
    region,
    mapTheme,
    onSelect,
    onRegionChange,
    highlightedId,
    userLocation,
    previewPlace,
    routeCoords,
    routeColor = '#B07207',
  },
  ref,
) {
  const style = mapTheme === 'dark' ? mapStyleDark : mapStyleLight;

  // The screen also wants this instance (to fit a route, to focus a pin), so
  // both refs are attached to the same node.
  // Tracked here rather than lifted: only the pins care about zoom, and pushing
  // it to the screen would re-render the whole list on every pan.
  const [detail, setDetail] = useState<PinDetail>(detailFor(region.latitudeDelta));

  const inner = useRef<MapView | null>(null);
  const attach = (node: MapView | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<MapView | null>).current = node;
  };

  // initialRegion only applies on mount, and this map now stays mounted for the
  // life of the Explore tab. Without this, changing your location updated every
  // label on screen while the map kept showing the old city.
  useEffect(() => {
    inner.current?.animateToRegion(region, 450);
    // Primitives, not the object: the region is rebuilt on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.latitude, region.longitude]);

  return (
    <MapView
      ref={attach}
      // Apple Maps ignores customMapStyle, so the Plated styling only applies
      // where the Google provider is actually available.
      provider={inExpoGo ? undefined : PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      customMapStyle={inExpoGo ? undefined : style}
      // Ours replaces the system dot; showing both would put two markers on the
      // same coordinate.
      showsUserLocation={!userLocation}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      onRegionChangeComplete={(r) => {
        setDetail(detailFor(r.latitudeDelta));
        onRegionChange?.(r);
      }}>
      {restaurants.map((r) => {
        const highlighted = r.id === highlightedId;
        return (
          <Marker
            // The key carries the highlight so the marker view is rebuilt when
            // it changes: tracksViewChanges is off for scroll performance, which
            // would otherwise freeze the pin at its first appearance.
            key={`${r.id}:${highlighted ? 'on' : 'off'}:${detail}`}
            coordinate={{ latitude: r.lat, longitude: r.lng }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={highlighted ? 10 : 1}
            tracksViewChanges={false}
            onPress={() => onSelect(r)}>
            <Pin
              type={r.type}
              statuses={r.statuses}
              score={r.platedRating}
              saved={r.saved}
              highlighted={highlighted}
              detail={detail}
              name={r.name}
            />
          </Marker>
        );
      })}
      {previewPlace && (
        <Marker
          coordinate={{ latitude: previewPlace.latitude, longitude: previewPlace.longitude }}
          anchor={{ x: 0.5, y: 1 }}
          zIndex={15}
          tracksViewChanges={false}>
          <View style={{ alignItems: 'center' }}>
            <View style={styles.previewPin}>
              <Ionicons name="add" size={14} color="#251B10" />
            </View>
            <View style={styles.pinLabel}>
              <Text style={styles.pinLabelText} numberOfLines={1}>
                {previewPlace.name}
              </Text>
            </View>
          </View>
        </Marker>
      )}
      {userLocation && (
        <Marker
          coordinate={userLocation}
          anchor={{ x: 0.5, y: 0.5 }}
          // The pulse is an animation, so this marker has to keep redrawing —
          // unlike the pins, which are static and opt out for performance.
          tracksViewChanges
          zIndex={20}>
          <UserDot />
        </Marker>
      )}
      {routeCoords && routeCoords.length > 1 && (
        <Polyline coordinates={routeCoords} strokeColor={routeColor} strokeWidth={5} lineCap="round" lineJoin="round" />
      )}
    </MapView>
  );
});

function Pin({
  type,
  statuses,
  score,
  saved,
  highlighted,
  detail = 'mid',
  name,
}: {
  type: PlaceType;
  statuses: PlaceStatus[];
  score: number;
  saved: boolean;
  highlighted?: boolean;
  detail?: PinDetail;
  name?: string;
}) {
  const glyph = PLACE_TYPE_META[type].icon;
  const tint = pinColorFor(statuses);

  // Zoomed out (and not the selected pin): a bare dot. Enough to read the shape
  // of the city without a hundred labels fighting each other.
  if (detail === 'far' && !highlighted) {
    return (
      <View style={[styles.pinFar, { backgroundColor: tint, borderColor: saved ? '#B07207' : '#fff' }]}>
        <MaterialCommunityIcons name={glyph} size={10} color="#fff" />
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center' }}>
    <View
      style={[
        styles.pin,
        { borderColor: saved ? '#B07207' : '#fff' },
        // Grown and gold-ringed rather than recolored: the category colour is
        // information, so it has to survive being selected.
        highlighted && styles.pinHighlighted,
      ]}>
      <View style={[styles.dot, highlighted && styles.dotLg, { backgroundColor: tint }]}>
        <MaterialCommunityIcons name={glyph} size={highlighted ? 15 : 13} color="#fff" />
      </View>
      <Text style={[styles.score, highlighted && styles.scoreLg]}>{score > 0 ? score.toFixed(1) : '—'}</Text>
      {saved && <Ionicons name="star" size={highlighted ? 13 : 11} color="#B07207" style={{ marginLeft: -1 }} />}
    </View>
      {/* Close in, the score alone stops being the useful bit — you want to know
          which place it is. */}
      {(detail === 'near' || highlighted) && name && (
        <View style={styles.pinLabel}>
          <Text style={styles.pinLabelText} numberOfLines={1}>
            {name}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Plated's "you are here": a solid orange dot in a white ring, with a slow
 * outward pulse so it stays findable against a busy map without being loud.
 */
function UserDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.quad),
        // JS-driven on purpose: the marker snapshots this view to draw it, and a
        // native-driven transform isn't reflected in that snapshot.
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Scales *down* from the container's full size rather than growing past it.
  // Overflowing the frame made the marker's snapshot change size as the pulse
  // ran, and since the anchor is a fraction of that image, the dot drifted by a
  // fixed number of pixels — invisible zoomed in, miles off zoomed out.
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.userWrap}>
      <Animated.View style={[styles.userPulse, { opacity, transform: [{ scale }] }]} />
      <View style={styles.userDot} />
    </View>
  );
}

/**
 * A place's map category. Cafés/drinks spots get their own category so they're
 * distinguishable on the map; restaurants fall back to the user's relationship
 * (saved → loved, rated → been, else dining).
 */


// Marker views are white-on-tinted-land, so hardcode the light chrome (they sit
// on the map, not the app surface) — only the score text tracks nothing here.
const styles = StyleSheet.create({
  // Fixed size, big enough for the pulse at full scale, so the rendered frame
  // never changes and anchor {0.5, 0.5} keeps meaning "the dot's centre".
  userWrap: { width: PULSE_SIZE, height: PULSE_SIZE, alignItems: 'center', justifyContent: 'center' },
  userPulse: {
    position: 'absolute',
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    backgroundColor: '#F07A16',
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F07A16',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  previewPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#251B10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinFar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinLabel: {
    marginTop: 3,
    maxWidth: 130,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  pinLabelText: { fontSize: 10, fontWeight: '800', color: '#251B10' },
  pinHighlighted: {
    borderColor: '#B07207',
    borderWidth: 3,
    // Grown by real layout, not `transform: scale`. react-native-maps rasterises
    // a marker into an image the size of the view's *frame*, and a transform
    // doesn't grow the frame — the enlarged pill overflowed it and came out
    // clipped flat along the bottom and right, with the gold ring sliced off.
    // Bigger padding/dot/type grows the frame too, so nothing is cut and the
    // art stays crisp instead of being an upscaled bitmap.
    paddingLeft: 5,
    paddingRight: 11,
    paddingVertical: 6,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  dotLg: { width: 24, height: 24, borderRadius: 12 },
  scoreLg: { fontSize: 15 },
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
