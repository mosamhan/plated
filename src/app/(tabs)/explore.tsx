import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type MapView from 'react-native-maps';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExploreMap, type MapRestaurant } from '@/components/ExploreMap';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { FilterChips } from '@/components/FilterChips';
import { InlineSearch } from '@/components/InlineSearch';
import { ActionSheet } from '@/components/ActionSheet';
import { CategoriesSheet, CollectionsSheet, MapSettingsSheet } from '@/components/MapSheets';
import { PlateTile } from '@/components/PlateTile';
import { PlatosFeed } from '@/components/PlatosFeed';
import { Skeleton } from '@/components/Skeleton';
import { RestaurantDetailSheet } from '@/components/RestaurantDetailSheet';
import { RouteStepsSheet } from '@/components/RouteStepsSheet';
import { fetchRoute, kmBetween, type RouteFailure, type RouteResult } from '@/lib/directions';
import { tapLight, tick } from '@/lib/haptics';
import type { PlaceResult } from '@/lib/places';
import { LOVED_RATING, placeTypeFor, type PlaceStatus, type PlaceType } from '@/lib/placeType';
import { openDirections } from '@/lib/external';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';
import { showAlert } from '@/lib/dialog';
import type { Region } from 'react-native-maps';

// Kept minimal so the grid stays the focus — the core sort/scope lenses only.
const FILTERS = ['Trending', 'Top Rated', 'Most Reordered', 'Nearby'];

const GAP = spacing.md;
const PADDING = spacing.lg;
/** Diameter of the round map controls; "Search this area" centres against it. */
const MAP_CIRCLE = 44;

/**
 * Where a route is headed. Carries its own name and coordinates rather than an
 * id alone, because Foursquare previews can be routed to before Plated has a
 * row for them — there'd be nothing to look the name up from. `restaurantId` is
 * set only when a row does exist, for the pin ring and the maps hand-off.
 */
type RouteDestination = { restaurantId?: string; name: string; lat: number; lng: number };

/** Country name at a coordinate, or null if the OS geocoder can't say. */
async function countryAt(p: { latitude: number; longitude: number }): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(p);
    return place?.country ?? null;
  } catch {
    return null;
  }
}

type Mode = 'platos' | 'discover';

// Only the ACTIVE segment shows its label; the other is icon-only, so the
// control keeps one compact shape. The map used to be a third segment — it's
// now part of Discover, because a map with no plates beside it answered half a
// question.
function ModeToggle({ mode, setMode, overlay }: { mode: Mode; setMode: (m: Mode) => void; overlay?: boolean }) {
  const { colors } = useTheme();
  const bg = overlay ? 'rgba(20,20,20,0.55)' : colors.surface;
  const seg = (m: Mode, icon: keyof typeof Ionicons.glyphMap, label: string) => {
    const on = mode === m;
    const inactive = overlay ? 'rgba(255,255,255,0.8)' : colors.textMuted;
    return (
      <AnimatedPressable onPress={() => { tick(); setMode(m); }} style={[styles.segCompact, on && { backgroundColor: colors.accent }]}>
        <Ionicons name={icon} size={15} color={on ? colors.accentText : inactive} />
        {on && <Text style={[styles.segText, { color: colors.accentText }]}>{label}</Text>}
      </AnimatedPressable>
    );
  };
  return (
    <View style={[styles.toggle, { backgroundColor: bg, alignSelf: 'center' }]}>
      {seg('discover', 'grid', 'Discover')}
      {seg('platos', 'play-circle', 'Platos')}
    </View>
  );
}

// Default map focus when the user has no location fix yet (NYC — where the
// seeded restaurants live).
const DEFAULT_REGION: Region = { latitude: 40.73, longitude: -73.98, latitudeDelta: 0.09, longitudeDelta: 0.09 };

/** Two-column grid skeleton shown while the Discover grid settles under the map. */
function ExploreGridSkeleton({ width }: { width: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: PADDING, gap: GAP }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width, gap: 8 }}>
          <Skeleton style={{ width, aspectRatio: 1, borderRadius: radius.lg }} />
          <Skeleton style={{ width: width * 0.7, height: 12, marginLeft: 4 }} />
          <Skeleton style={{ width: width * 0.5, height: 10, marginLeft: 4, marginBottom: 6 }} />
        </View>
      ))}
    </View>
  );
}

export default function Explore() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const { exploreOrders, topRestaurants, ordersByRestaurant, restaurantFor, ensureRestaurant, currentUser } = useData();
  const { location } = useLocation();
  const { isSaved, openSaveSheet } = useCollections();
  const mapRef = useRef<MapView>(null);
  const [filter, setFilter] = useState('Trending');
  const [mode, setMode] = useState<Mode>('discover');
  // Brief settle so the grid fades in under the map rather than snapping in —
  // mirrors the Home feed's boot skeleton.
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 400);
    return () => clearTimeout(t);
  }, []);

  // Map state (design §1 + §"State").
  const [mapQuery, setMapQuery] = useState('');
  /** Empty means "no cuisine filter" — everything shows. Same rule as status. */
  const [activeTypes, setActiveTypes] = useState<PlaceType[]>([]);
  /** Empty means "don't filter by history" — not "show nothing". */
  const [activeStatuses, setActiveStatuses] = useState<PlaceStatus[]>([]);
  const [myTableOnly, setMyTableOnly] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  // Map appearance can be overridden independently of the app theme (design §3).
  const [mapThemeOverride, setMapThemeOverride] = useState<'light' | 'dark' | null>(null);
  const [activeSheet, setActiveSheet] = useState<null | 'settings' | 'collections' | 'categories'>(null);
  const [route, setRoute] = useState<(RouteResult & { destination: RouteDestination }) | null>(null);
  // The map is a window inside Discover; expanding is a state of it, not a mode.
  const [mapExpanded, setMapExpanded] = useState(false);
  /**
   * Set when the map was opened full-screen from a restaurant card's "Map"
   * button: the card is dismissed so the map is fully usable, the camera frames
   * this pin, and the collapse control reads "Back to plate" (reopens the card)
   * instead of "Show plates". Cleared when they go back or collapse.
   */
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  // Drag-resizable, because how much map you want depends on whether you're
  // reading the list or working the map. The ref mirrors it so the pan handler
  // isn't rebuilt (and doesn't go stale) on every pixel of a drag.
  /** The plate the sheet should offer alongside the place. */
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);
  /**
   * Which pin is ringed. Separate from the sheet's selection on purpose: the
   * sheet covers the whole map, so a highlight that died with it could never
   * actually be seen. It outlives the sheet and marks where you just looked.
   */
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [sheetSide, setSheetSide] = useState<'place' | 'plate'>('place');
  /** Where the camera is now, vs. the area the list is actually filtered to. */
  const [cameraRegion, setCameraRegion] = useState<Region | null>(null);
  const [areaRegion, setAreaRegion] = useState<Region | null>(null);
  const [routing, setRouting] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  /** Google vs Apple for the Navigate hand-off — asked each time. */
  const [mapsChooserOpen, setMapsChooserOpen] = useState(false);
  /** Fullscreen search: collapsed to a circle until asked for. */
  const [fullSearchOpen, setFullSearchOpen] = useState(false);
  /** Something has been typed, so hovering away shouldn't take it back. */
  const [fullSearchDirty, setFullSearchDirty] = useState(false);

  // Slides the field open and slides "Show plates" over beside the menu, rather
  // than either popping between layouts.
  const toggleFullSearch = (open: boolean) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
    setFullSearchOpen(open);
    if (!open) setFullSearchDirty(false);
  };
  /** A Foursquare place being looked at that Plated has no row for yet. */
  const [preview, setPreview] = useState<PlaceResult | null>(null);
  const mapTheme: 'light' | 'dark' = mapThemeOverride ?? (colors.isDark ? 'dark' : 'light');

  /**
   * Say why a route couldn't be drawn, in terms of the actual situation rather
   * than a blanket "try again" — which is useless advice when the honest answer
   * is that no road connects the two places.
   *
   * Countries come from the OS geocoder, best-effort: naming them turns "no
   * route" into something the user can act on. When it can't resolve them the
   * copy falls back to distance alone rather than guessing. A drivable border
   * crossing never reaches here — Google returns a route for those.
   */
  const explainRouteFailure = async (
    reason: RouteFailure,
    dest: RouteDestination,
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) => {
    if (reason === 'quota') {
      showAlert('Directions unavailable', 'Plated has hit its directions limit for now. Try again later.');
      return;
    }
    if (reason === 'unavailable') {
      showAlert('Directions unavailable', "Directions aren't available right now.");
      return;
    }
    if (reason === 'not-found') {
      showAlert('Can’t route there', `We couldn’t match ${dest.name} to a road on the map.`);
      return;
    }
    if (reason === 'error') {
      showAlert('Could not build a route', 'Please try again in a moment.');
      return;
    }

    // 'unreachable' and 'too-far' are both about the gap, so quantify it.
    const km = kmBetween(from, to);
    const far = km >= 10 ? `${Math.round(km).toLocaleString()} km` : `${km.toFixed(1)} km`;
    const [here, there] = await Promise.all([countryAt(from), countryAt(to)]);
    const abroad = here && there && here !== there ? there : null;

    if (reason === 'too-far') {
      showAlert(
        'Too far to map',
        `${dest.name} is about ${far} away${abroad ? `, in ${abroad}` : ''}. That's drivable, but further than Directions will return a route for.`,
      );
      return;
    }
    showAlert(
      'No road route',
      abroad
        ? `${dest.name} is in ${abroad}, about ${far} from you${here ? ` in ${here}` : ''} — there's no drivable road between the two, so a car won't get you there.`
        : `${dest.name} is about ${far} away and no drivable road connects it to where you are.`,
    );
  };

  /**
   * Draw a driving route to a destination, inside the app: fetch the polyline,
   * close the overlay, and fit the camera to the line. Every "Directions" in
   * Plated lands here — the only hand-off to a maps app is Navigate, inside the
   * steps sheet, where turn-by-turn is the actual ask.
   *
   * Forces Discover + the expanded map once the route resolves: the caller may
   * be on Platos, or may have arrived from another screen entirely, and a route
   * drawn on a map that isn't on screen is invisible.
   */
  const startRoute = async (dest: RouteDestination) => {
    if (location.lat == null || location.lng == null) {
      showAlert('Location needed', 'Set your location so Plated can draw a route from where you are.');
      return;
    }
    const from = { latitude: location.lat, longitude: location.lng };
    const to = { latitude: dest.lat, longitude: dest.lng };
    setRouting(true);
    const outcome = await fetchRoute(from, to);
    setRouting(false);
    if (!outcome.ok) {
      await explainRouteFailure(outcome.reason, dest, from, to);
      return;
    }
    const result = outcome.route;
    // Only once there's actually a line to show: switching the user off Platos
    // and expanding the map to then say "couldn't build a route" would have
    // rearranged the screen for nothing.
    setMode('discover');
    setMapExpanded(true);
    setSelectedRestaurant(null);
    setRoute({ ...result, destination: dest });
    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(result.coordinates, {
        edgePadding: { top: 120, right: 60, bottom: 200, left: 60 },
        animated: true,
      });
    });
  };

  /**
   * Clear the drawn route AND deselect the pin. The pin stays ringed while a
   * route is up, and its marker never re-mounts (its key encodes the highlight,
   * which doesn't change) — so react-native-maps keeps it natively selected and
   * a re-tap fires no onPress, leaving the card unable to reopen. Clearing the
   * highlight re-mounts the marker, so tapping it again works.
   */
  const clearRoute = () => {
    setRoute(null);
    setHighlighted(null);
  };

  /** Route to a saved row by id — resolves its name/coords, or explains why not. */
  const routeToRestaurant = (restaurantId: string) => {
    const r = restaurantFor(restaurantId);
    if (r?.lat == null || r?.lng == null) {
      showAlert('No coordinates', "We don't have this place's location yet.");
      return;
    }
    startRoute({ restaurantId, name: r.name, lat: r.lat, lng: r.lng });
  };

  /**
   * Directions pressed on a screen with no map of its own (the restaurant
   * screen, search) arrives as route params — see `lib/inAppRoute`. The whole
   * destination travels, so there's nothing to look up and no wait for data.
   *
   * Consumed once and cleared: without that, coming back to this tab later
   * would silently redraw a stale route.
   */
  const { routeId, routeName, routeLat, routeLng, focusId, focusExpand } = useLocalSearchParams<{
    routeId?: string;
    routeName?: string;
    routeLat?: string;
    routeLng?: string;
    focusId?: string;
    focusExpand?: string;
  }>();

  /**
   * A restaurant tapped from the feed (or a card's "Map" button): land on
   * Discover with the map showing that place and its card open. With
   * focusExpand, the map opens full-screen and the card sits as a half sheet
   * below it. Cleared after use for the same reason the route params are —
   * otherwise returning to the tab reopens it.
   */
  const consumedFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || consumedFocus.current === focusId) return;
    if (!restaurantFor(focusId)) return; // data not in yet; retry next render
    consumedFocus.current = focusId;
    const expand = focusExpand === '1';
    router.setParams({ focusId: undefined, focusExpand: undefined });
    setMode('discover');
    if (expand) {
      // Full-screen map on the pin, no card — "Back to plate" brings it back.
      setSelectedRestaurant(null);
      setHighlighted(focusId);
      setMapFocus(focusId);
      setMapExpanded(true);
    } else {
      openPin(focusId);
      focusRestaurant(focusId);
    }
    // These close over render state; the param is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusExpand, restaurantFor]);
  const consumedRoute = useRef<string | null>(null);
  useEffect(() => {
    if (!routeLat || !routeLng) return;
    const key = `${routeId ?? ''}@${routeLat},${routeLng}`;
    if (consumedRoute.current === key) return;
    consumedRoute.current = key;
    router.setParams({ routeId: undefined, routeName: undefined, routeLat: undefined, routeLng: undefined });
    startRoute({
      restaurantId: routeId,
      name: routeName || 'Destination',
      lat: Number(routeLat),
      lng: Number(routeLng),
    });
    // startRoute closes over render-scoped state; re-running on all of it would
    // refire the route. The params are the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, routeName, routeLat, routeLng]);

  const withinArea = (r: Region, lat: number, lng: number) =>
    Math.abs(lat - r.latitude) <= r.latitudeDelta / 2 && Math.abs(lng - r.longitude) <= r.longitudeDelta / 2;

  const userLocation =
    location.lat != null && location.lng != null
      ? { latitude: location.lat, longitude: location.lng }
      : null;

  const previewPin =
    preview?.lat != null && preview?.lng != null
      ? { latitude: preview.lat, longitude: preview.lng, name: preview.name }
      : null;

  const data = useMemo(() => {
    let list = exploreOrders(filter);
    // The cuisine chips filter the grid as well as the pins — picking "Pizza"
    // and still being shown every plate in the city reads as the filter having
    // been ignored.
    if (activeTypes.length > 0) {
      list = list.filter((o) => {
        const r = restaurantFor(o.restaurantId);
        return !!r && activeTypes.includes(placeTypeFor(r.cuisine));
      });
    }
    if (!areaRegion) return list;
    // Only plates whose restaurant sits in the framed area. A plate whose
    // restaurant has no coordinates can't be placed, so it drops out rather
    // than pretending to be here.
    return list.filter((o) => {
      const r = restaurantFor(o.restaurantId);
      return r?.lat != null && r?.lng != null && withinArea(areaRegion, r.lat, r.lng);
    });
  }, [exploreOrders, filter, areaRegion, restaurantFor, activeTypes]);

  // Restaurants that have coordinates, tagged with their per-user category.
  const mapRestaurants = useMemo<MapRestaurant[]>(() => {
    return topRestaurants()
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        const saved = isSaved({ type: 'restaurant', id: r.id });
        // "Been" and "Loved" are about *this* user, so they read the current
        // user's own ratings here rather than the restaurant's overall score.
        const mine = ordersByRestaurant(r.id).filter((o) => o.userId === currentUser.id);
        const best = mine.reduce((m, o) => Math.max(m, o.rating), 0);
        const statuses: PlaceStatus[] = [];
        if (best >= LOVED_RATING) statuses.push('loved');
        if (mine.length > 0) statuses.push('been');
        if (saved) statuses.push('saved');
        return {
          ...r,
          lat: r.lat as number,
          lng: r.lng as number,
          saved,
          type: placeTypeFor(r.cuisine),
          statuses,
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topRestaurants, ordersByRestaurant, isSaved, currentUser.id]);

  const visiblePins = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    return mapRestaurants.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q) || r.location.toLowerCase().includes(q)) &&
        (activeTypes.length === 0 || activeTypes.includes(r.type)) &&
        // No status selected = no history filter, rather than an empty map.
        (activeStatuses.length === 0 || activeStatuses.some((st) => r.statuses.includes(st))) &&
        (!myTableOnly || r.saved),
    );
  }, [mapRestaurants, mapQuery, activeTypes, activeStatuses, myTableOnly]);

  const region: Region = useMemo(() => {
    // Opened on a pin from a card's "Map" button: frame that pin, zoomed in, so
    // the expanded map lands on it (the map mounts after the tap, so a ref-based
    // animateCamera would fire against a null ref — driving it through the
    // region the map initialises with is what actually works).
    if (mapFocus) {
      const r = restaurantFor(mapFocus);
      if (r?.lat != null && r?.lng != null) {
        return { latitude: r.lat, longitude: r.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
      }
    }
    if (location.lat != null && location.lng != null) {
      return { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.09, longitudeDelta: 0.09 };
    }
    return DEFAULT_REGION;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.lat, location.lng, mapFocus]);

  /** Recenter the map on the user's location dot, zoomed into their area. */
  const centerOnMe = () => {
    if (location.lat == null || location.lng == null) {
      showAlert('Location needed', 'Set your location so Plated can center the map on you.');
      return;
    }
    mapRef.current?.animateToRegion(
      { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      350,
    );
  };

  /** Frame a restaurant on the map without changing the zoom the user chose. */
  const focusRestaurant = (restaurantId: string) => {
    const r = restaurantFor(restaurantId);
    if (r?.lat == null || r?.lng == null) return;
    mapRef.current?.animateCamera({ center: { latitude: r.lat, longitude: r.lng } }, { duration: 350 });
  };

  /** A plate was tapped: pin its restaurant and open the sheet on the plate. */
  const openPlate = (orderId: string, restaurantId: string) => {
    tapLight();
    setSelectedPlate(orderId);
    setSheetSide('plate');
    focusRestaurant(restaurantId);
    setHighlighted(restaurantId);
    setSelectedRestaurant(restaurantId);
  };

  /**
   * A pin was tapped: open on the place. No dish is chosen, so the plate side
   * lists everything rated here rather than guessing which one was meant.
   */
  const openPin = (restaurantId: string) => {
    tapLight();
    setSelectedPlate(null);
    setSheetSide('place');
    setHighlighted(restaurantId);
    setSelectedRestaurant(restaurantId);
    // Opening a card exits map-focus mode, so the control reverts to "Show plates".
    setMapFocus(null);
  };

  /**
   * Dismissing the card deselects: the tile's accent outline and the pin's ring
   * both clear, so closing reads as undoing the selection rather than leaving
   * the map marked. (This deliberately reverses the earlier behaviour of
   * keeping the pin ringed to answer "where is this?" — a highlight nothing on
   * screen explains looks like a stuck state.)
   */
  const closeSheet = () => {
    setSelectedRestaurant(null);
    setPreview(null);
    setSelectedPlate(null);
    setHighlighted(null);
  };

  /** Put an off-Plated place on the map and open it, without writing anything. */
  const openPreview = (place: PlaceResult) => {
    setSelectedRestaurant(null);
    setSelectedPlate(null);
    setHighlighted(null);
    setPreview(place);
    if (place.lat != null && place.lng != null) {
      mapRef.current?.animateCamera(
        { center: { latitude: place.lat, longitude: place.lng }, zoom: 15 },
        { duration: 400 },
      );
    }
  };

  /**
   * The user acted on a previewed place, so now it earns a row: upsert it, then
   * continue into whatever they were doing. Deferring the write to this moment is
   * what keeps browsed-but-unrated places out of the restaurants table.
   */
  const adoptPreview = async (place: PlaceResult, then: 'save' | 'plate') => {
    if (then === 'plate') {
      // The create flow takes the Foursquare place directly and upserts on post,
      // so there's nothing to write here.
      setPreview(null);
      router.push(
        `/create?fsqId=${encodeURIComponent(place.fsqId)}&fsqName=${encodeURIComponent(place.name)}` +
          `&fsqCuisine=${encodeURIComponent(place.cuisine ?? '')}&fsqLocation=${encodeURIComponent(place.location ?? '')}`,
      );
      return;
    }
    const id = await ensureRestaurant(place);
    if (!id) {
      showAlert('Could not save this place', 'Please try again in a moment.');
      return;
    }
    setPreview(null);
    openSaveSheet({ type: 'restaurant', id });
  };

  // Offer to refilter only once the camera has actually left the area the list
  // reflects — which on arrival is wherever the map opened, not "nowhere".
  // Comparing against a null area made the button show before any panning.
  const framed = areaRegion ?? region;
  const areaMoved =
    !!cameraRegion &&
    (Math.abs(cameraRegion.latitude - framed.latitude) > framed.latitudeDelta / 3 ||
      Math.abs(cameraRegion.longitude - framed.longitude) > framed.longitudeDelta / 3 ||
      Math.abs(cameraRegion.latitudeDelta - framed.latitudeDelta) > framed.latitudeDelta / 2);

  // Shared chrome — the sheets and overlays belong to the map whether it's a
  // window inside Discover or filling the screen.
  const overlays = (
    <>
      <RestaurantDetailSheet
        restaurantId={selectedRestaurant}
        onClose={closeSheet}
        onRoute={routeToRestaurant}
        onRoutePreview={startRoute}
        plateId={selectedPlate}
        side={sheetSide}
        onSideChange={setSheetSide}
        preview={preview}
        onAdopt={adoptPreview}
        // "Map" dismisses the card and opens the full-screen map framed on the
        // pin, so the map is fully usable; "Back to plate" brings the card back.
        onOpenMap={
          selectedRestaurant
            ? () => {
                const id = selectedRestaurant;
                setSelectedRestaurant(null);
                setSelectedPlate(null);
                setHighlighted(id);
                setMapFocus(id);
                setMapExpanded(true);
              }
            : undefined
        }
      />

      {route && (
        <RouteStepsSheet
          visible={stepsOpen}
          onClose={() => setStepsOpen(false)}
          destination={route.destination.name}
          distanceText={route.distanceText}
          durationText={route.durationText}
          steps={route.steps}
          // The one deliberate hand-off left: turn-by-turn is what a maps app is
          // for, so Navigate leaves. Which app is the user's call, not the
          // platform's — the chooser opens instead of assuming Apple on iOS.
          onNavigate={() => {
            setStepsOpen(false);
            setMapsChooserOpen(true);
          }}
        />
      )}

      {/* Google vs Apple, asked each time. Coordinates come off the route's
          destination, which a Foursquare preview has even with no Plated row. */}
      <ActionSheet
        visible={mapsChooserOpen && !!route}
        onClose={() => setMapsChooserOpen(false)}
        title={route ? `Navigate to ${route.destination.name}` : undefined}
        actions={[
          {
            label: 'Google Maps',
            icon: 'navigate',
            onPress: () => route && openDirections('google', route.destination),
          },
          {
            label: 'Apple Maps',
            icon: 'map',
            onPress: () => route && openDirections('apple', route.destination),
          },
        ]}
      />

      {activeSheet === 'settings' && (
        <MapSettingsSheet
          onClose={() => setActiveSheet(null)}
          mapTheme={mapTheme}
          setMapTheme={setMapThemeOverride}
            myTableOnly={myTableOnly}
          setMyTableOnly={setMyTableOnly}
          onOpenCollections={() => setActiveSheet('collections')}
          onOpenCategories={() => setActiveSheet('categories')}
          onOpenLocation={() => router.push('/settings/location')}
        />
      )}
      {activeSheet === 'collections' && (
        <CollectionsSheet onClose={() => setActiveSheet(null)} onSelectRestaurant={openPin} />
      )}
      {activeSheet === 'categories' && (
        <CategoriesSheet
          onClose={() => setActiveSheet(null)}
          activeTypes={activeTypes}
          setActiveTypes={setActiveTypes}
          activeStatuses={activeStatuses}
          setActiveStatuses={setActiveStatuses}
        />
      )}

    </>
  );

  const searchThisArea = areaMoved && cameraRegion && (
    <Pressable
      onPress={() => setAreaRegion(cameraRegion)}
      style={[styles.areaBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="search" size={14} color={colors.accent} />
      <Text style={[styles.areaBtnText, { color: colors.text }]}>Search this area</Text>
    </Pressable>
  );

  // Platos — immersive vertical reels with the mode toggle floating on top.
  if (mode === 'platos') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <PlatosFeed bottomInset={12} onRestaurantPress={openPin} />
        <View style={[styles.overlayToggle, { top: insets.top + 8 }]}>
          <ModeToggle mode={mode} setMode={setMode} overlay />
        </View>

        {/* Tapping a reel's restaurant opens the same sheet as a map pin. Only
            this one overlay: the rest of `overlays` is map chrome, and there is
            no map mounted here. Directions still routes in-app — startRoute
            flips back to Discover and expands the map, so the line is drawn on
            a map the user can actually see. */}
        <RestaurantDetailSheet
          restaurantId={selectedRestaurant}
          onClose={closeSheet}
            onRoute={routeToRestaurant}
          onRoutePreview={startRoute}
          plateId={selectedPlate}
          side={sheetSide}
          onSideChange={setSheetSide}
          preview={preview}
          onAdopt={adoptPreview}
        />
      </View>
    );
  }

  // Map expanded — the same map filling the screen for panning and routing.
  if (mapExpanded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ExploreMap
          ref={mapRef}
          restaurants={visiblePins}
          region={region}
          mapTheme={mapTheme}
          onSelect={(r) => openPin(r.id)}
          onRegionChange={setCameraRegion}
          highlightedId={highlighted}
          userLocation={userLocation}
          previewPlace={previewPin}
          routeCoords={route?.coordinates}
          routeColor={colors.accent}
        />

        {/* Controls menu (filters/appearance/location) · collapse · search. */}
        <View style={[styles.mapTopRow, { top: insets.top + 14 }]}>
          <Pressable
            onPress={() => setActiveSheet('settings')}
            style={[styles.mapCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="menu" size={22} color={colors.text} />
            <View style={[styles.menuBadge, { backgroundColor: colors.accent, borderColor: colors.card }]}>
              <Ionicons name={myTableOnly ? 'bookmark' : 'earth'} size={9} color={colors.accentText} />
            </View>
          </Pressable>
          {fullSearchOpen ? (
            <View
              // Pointer events on the container, so moving the cursor off the
              // *search* is what puts an untouched field away — leaving
              // mid-typed text alone.
              onPointerLeave={() => {
                if (!fullSearchDirty) toggleFullSearch(false);
              }}
              style={{ flex: 1, marginLeft: 10 }}>
              <InlineSearch
                autoFocus
                onDismiss={() => toggleFullSearch(false)}
                onQueryChange={(q) => setFullSearchDirty(q.length > 0)}
                onSelectRated={(id) => {
                  toggleFullSearch(false);
                  openPin(id);
                }}
                onSelectExternal={(place) => {
                  toggleFullSearch(false);
                  openPreview(place);
                }}
              />
            </View>
          ) : (
            <Pressable
              // Hover is the ask; a pointer only exists on iPad/Mac/web, so tap
              // stays as the equivalent gesture on a phone.
              onHoverIn={() => toggleFullSearch(true)}
              onPress={() => toggleFullSearch(true)}
              style={[styles.mapCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Under the menu rather than in the top row: the row is the search's to
            take, and stacking these two keeps the map controls in one corner.
            Opened from a card's Map button, this reads "Back to plate" and
            reopens that card; otherwise it collapses the map back to Discover. */}
        <Pressable
          onPress={() => {
            if (mapFocus) {
              const id = mapFocus;
              setMapFocus(null);
              openPin(id);
            } else {
              setMapExpanded(false);
            }
          }}
          style={[
            styles.underMenu,
            { top: insets.top + 14 + MAP_CIRCLE + 10, backgroundColor: colors.card, borderColor: colors.border },
            // While the search is open it drops its label and matches the menu
            // circle above it. That keeps it entirely left of the results list,
            // which starts just right of the menu — so the two never overlap
            // rather than one being drawn over the other.
            fullSearchOpen && styles.underMenuTight,
          ]}>
          <Ionicons name={mapFocus ? 'arrow-back' : 'contract'} size={15} color={colors.text} />
          {!fullSearchOpen && (
            <Text style={[styles.collapseText, { color: colors.text }]}>
              {mapFocus ? 'Back to plate' : 'Show plates'}
            </Text>
          )}
        </Pressable>

        {/* Sits in the top row's own band, centred in the gap between the menu
            and search circles rather than stacked below them. Matching the row's
            height and centring vertically keeps it aligned to the circles
            whatever the pill's text height works out to. Hidden while the search
            is open, since the field expands across that gap. */}
        {!route && !fullSearchOpen && (
          <View style={[styles.areaWrap, { top: insets.top + 14, height: MAP_CIRCLE }]}>{searchThisArea}</View>
        )}

        {/* In-app route banner — distance + ETA, with clear + hand-off options. */}
        {route && (
          <View style={[styles.routeBanner, { bottom: 16, backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.routeIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="navigate" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeTitle, { color: colors.text }]} numberOfLines={1}>
                {route.destination.name}
              </Text>
              <Text style={[styles.routeMeta, { color: colors.textMuted }]}>
                {route.distanceText} · {route.durationText} drive
              </Text>
            </View>
            {/* Steps first, Navigate inside them: reading the route is the part
                that belongs in Plated, driving it belongs to a maps app. */}
            <Pressable
              onPress={() => setStepsOpen(true)}
              style={[styles.routeGo, { backgroundColor: colors.accent }]}>
              <Ionicons name="list" size={14} color={colors.accentText} />
              <Text style={[styles.routeGoText, { color: colors.accentText }]}>Steps</Text>
            </Pressable>
            <Pressable onPress={clearRoute} hitSlop={8} style={styles.routeClose}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {routing && (
          <View style={[styles.routingToast, { top: insets.top + 70, backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Building route…</Text>
          </View>
        )}

        {/* Recenter on the user's location, zoomed into their area. Sits above
            the route banner when one's up so the two don't overlap. */}
        <Pressable
          onPress={centerOnMe}
          style={[
            styles.locateBtn,
            { bottom: (route ? 92 : 24) + insets.bottom, backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <Ionicons name="locate" size={22} color={colors.accent} />
        </Pressable>

        {overlays}
      </View>
    );
  }

  // Discover — the map as a live window over the plates it's showing.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <View style={styles.titleRow}>
          <Text style={[typography.title, { color: colors.text }]}>Explore</Text>
          {/* Label only — changing it now lives in the map's controls menu, so
              there's one place that owns "where am I looking". */}
          <View style={styles.locChip}>
            <Ionicons name="location" size={13} color={colors.accent} />
            <Text style={[styles.locText, { color: colors.textMuted }]} numberOfLines={1}>
              {location.label}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <ModeToggle mode={mode} setMode={setMode} />
        </View>

        <View style={styles.controlRow}>
          <AnimatedPressable
            onPress={() => setActiveSheet('settings')}
            style={[styles.menuSquare, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="menu" size={20} color={colors.text} />
            <View style={[styles.menuBadge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
              <Ionicons name={myTableOnly ? 'bookmark' : 'earth'} size={9} color={colors.accentText} />
            </View>
          </AnimatedPressable>
          <InlineSearch onSelectRated={openPin} onSelectExternal={openPreview} />
        </View>

      </View>

      <FlatList
        data={booting ? [] : data}
        key="grid"
        numColumns={2}
        keyExtractor={(o) => o.id}
        columnWrapperStyle={{ paddingHorizontal: PADDING, gap: GAP }}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom, gap: GAP }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).springify().damping(16)}>
            <PlateTile
              order={item}
              width={tileWidth}
              selected={item.id === selectedPlate}
              onPress={() => openPlate(item.id, item.restaurantId)}
            />
          </Animated.View>
        )}
        ListHeaderComponent={
          <>
        {/* The map scrolls with the page; the header above (title, mode toggle,
            menu + search) is what stays put. In the list header rather than
            above the list so there's one scroll, not two stacked ones. */}
        <View style={styles.mapWindow}>
          <ExploreMap
            ref={mapRef}
            restaurants={visiblePins}
            region={region}
            mapTheme={mapTheme}
            onSelect={(r) => openPin(r.id)}
            onRegionChange={setCameraRegion}
            highlightedId={highlighted}
            userLocation={userLocation}
            previewPlace={previewPin}
            routeCoords={route?.coordinates}
            routeColor={colors.accent}
          />
          {/* The expand affordance steps aside while a route is up — the route
              summary below is itself the way into the full map. */}
          {!route && (
            <AnimatedPressable
              onPress={() => setMapExpanded(true)}
              hitSlop={6}
              style={[styles.expandBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="expand" size={16} color={colors.text} />
            </AnimatedPressable>
          )}
          {!route && <View style={styles.areaWrapInline}>{searchThisArea}</View>}

          {/* The border is drawn *over* the map rather than on the clipping
              container. GMSMapView is a native view, so the container's rounded
              clip antialiases against the map's own white backing and leaves a
              1px light seam inside the border — most visible against the lake in
              light mode. Painting the ring on top covers that seam. */}
          <View pointerEvents="none" style={[styles.mapWindowRing, { borderColor: colors.border }]} />

          {/* A route drawn on a 220pt map is unreadable on its own, so the
              summary states where you're headed and offers the full screen. */}
          {route && (
            <Pressable
              onPress={() => setMapExpanded(true)}
              style={[styles.miniRoute, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.routeIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="navigate" size={16} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.routeTitle, { color: colors.text }]} numberOfLines={1}>
                  {route.destination.name}
                </Text>
                <Text style={[styles.routeMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {route.distanceText} · {route.durationText} drive
                </Text>
              </View>
              {/* An icon rather than "tap for the full map" — the hint didn't fit
                  the width and truncated to nonsense. */}
              <Pressable
                onPress={() => setStepsOpen(true)}
                hitSlop={10}
                style={[styles.miniSteps, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="list" size={13} color={colors.accent} />
                <Text style={[styles.miniStepsText, { color: colors.accent }]}>Steps</Text>
              </Pressable>
              <Ionicons name="expand" size={15} color={colors.textMuted} />
              <Pressable
                onPress={clearRoute}
                hitSlop={10}
                style={{ paddingHorizontal: 2 }}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </Pressable>
          )}
        </View>


        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />

          <View style={styles.countRow}>
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {data.length} {data.length === 1 ? 'plate' : 'plates'} · {filter}
              {areaRegion ? ' · in this area' : ''}
            </Text>
            {areaRegion && (
              <Pressable onPress={() => setAreaRegion(null)} hitSlop={6}>
                <Text style={[styles.clearArea, { color: colors.accent }]}>Clear area</Text>
              </Pressable>
            )}
          </View>
          {booting && <ExploreGridSkeleton width={tileWidth} />}
          </>
        }
        ListEmptyComponent={
          booting ? null : (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {areaRegion ? 'No plates in this part of the map yet.' : 'No plates for this filter yet.'}
            </Text>
          )
        }
      />

      {overlays}
    </View>
  );
}

/**
 * Fixed, not drag-resizable. The map lives inside the page's scroll now, and a
 * vertical resize gesture on top of a vertical scroll meant neither worked
 * reliably — the grip won drags that were meant to scroll the page.
 */
const MAP_HEIGHT = 220;

const styles = StyleSheet.create({
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: PADDING, marginTop: 14 },
  menuSquare: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * The pinned chrome. It needs its own bottom edge and padding because the
   * page scrolls underneath it — without them the plate grid slides up flush
   * against the search field with nothing separating the two.
   */
  header: { paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  mapWindow: {
    height: MAP_HEIGHT,
    marginHorizontal: PADDING,
    marginTop: 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  mapWindowRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  expandBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaWrapInline: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  miniRoute: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  miniSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  miniStepsText: { fontSize: 12, fontWeight: '800' },
  areaWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  areaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  areaBtnText: { fontSize: 13, fontWeight: '800' },
  collapseText: { fontSize: 13, fontWeight: '800' },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    marginBottom: spacing.md,
  },
  clearArea: { fontSize: 13, fontWeight: '800' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PADDING,
    gap: 10,
  },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 170 },
  locText: { fontSize: 13, fontWeight: '700' },
  toggle: { flexDirection: 'row', borderRadius: radius.pill, padding: 3, gap: 2 },
  segCompact: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  segText: { fontSize: 14, fontWeight: '800' },
  overlayToggle: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  count: { fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
  underMenu: {
    position: 'absolute',
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  underMenuTight: { width: 44, height: 44, paddingHorizontal: 0, justifyContent: 'center' },
  locateBtn: {
    position: 'absolute',
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  mapTopRow: {
    // Above the stacked controls below it: the search dropdown belongs to this
    // row, and the later-painted "Show plates" was covering the first result.
    zIndex: 40,
    position: 'absolute',
    left: PADDING,
    right: PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mapCircle: {
    width: MAP_CIRCLE,
    height: MAP_CIRCLE,
    borderRadius: MAP_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  menuBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  routeBanner: {
    position: 'absolute',
    left: PADDING,
    right: PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  routeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  routeTitle: { fontSize: 15, fontWeight: '800' },
  routeMeta: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  routeGo: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 36, borderRadius: radius.pill },
  routeGoText: { fontSize: 13, fontWeight: '800' },
  routeClose: { padding: 2 },
  routingToast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
