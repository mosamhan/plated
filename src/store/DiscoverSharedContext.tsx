import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { createContext, ReactNode, RefObject, useContext, useRef, useState } from 'react';
import type MapView from 'react-native-maps';

import { fetchRoute, kmBetween, type RouteFailure, type RouteResult } from '@/lib/directions';
import { showAlert } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';
import type { PlaceResult } from '@/lib/places';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { useExploreMode } from '@/store/ExploreModeContext';
import { useLocation } from '@/store/LocationContext';
import { useMainPagerControl } from '@/store/MainPagerControl';

/**
 * Where a route is headed. Carries its own name and coordinates rather than an
 * id alone, because Foursquare previews can be routed to before Plated has a
 * row for them — there'd be nothing to look the name up from. `restaurantId` is
 * set only when a row does exist, for the pin ring and the maps hand-off.
 */
export type RouteDestination = { restaurantId?: string; name: string; lat: number; lng: number };
export type RouteWithDestination = RouteResult & { destination: RouteDestination };

// The small map window is ~220pt tall; the full-screen map has the whole
// screen (minus the top controls and bottom banner) to work with.
const SMALL_MAP_ROUTE_PADDING = { top: 24, right: 24, bottom: 24, left: 24 };
const FULLSCREEN_ROUTE_PADDING = { top: 120, right: 60, bottom: 200, left: 60 };

/** Country name at a coordinate, or null if the OS geocoder can't say. */
async function countryAt(p: { latitude: number; longitude: number }): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(p);
    return place?.country ?? null;
  } catch {
    return null;
  }
}

interface DiscoverShared {
  mapRef: RefObject<MapView | null>;
  selectedRestaurant: string | null;
  selectedPlate: string | null;
  sheetSide: 'place' | 'plate';
  setSheetSide: (side: 'place' | 'plate') => void;
  preview: PlaceResult | null;
  highlighted: string | null;
  mapFocus: string | null;
  mapExpanded: boolean;
  setMapExpanded: (expanded: boolean) => void;
  /** Expand full-screen, re-fitting to the current route (if any) for the bigger viewport. */
  expandMap: () => void;
  route: RouteWithDestination | null;
  routing: boolean;
  /** A pin was tapped: open on the place. No dish is chosen, so the plate side lists everything rated here rather than guessing which one was meant. */
  openPin: (restaurantId: string) => void;
  /** A plate was tapped: pin its restaurant and open the sheet on the plate. */
  openPlate: (orderId: string, restaurantId: string) => void;
  /** Dismissing the card deselects — closing reads as undoing the selection rather than leaving the map marked. */
  closeSheet: () => void;
  /** Draw a driving route to a destination, in-app: fetch the polyline, close the overlay, fit the camera. */
  startRoute: (dest: RouteDestination) => Promise<void>;
  /** Route to a saved row by id — resolves its name/coords, or explains why not. */
  routeToRestaurant: (restaurantId: string) => void;
  /** The user acted on a previewed place, so now it earns a row. */
  adoptPreview: (place: PlaceResult, then: 'save' | 'plate') => Promise<void>;
  /** Put an off-Plated place on the map and open it, without writing anything. */
  openPreview: (place: PlaceResult) => void;
  /** Frame a restaurant on the map without changing the zoom the user chose. */
  focusRestaurant: (restaurantId: string) => void;
  /** "Map" on an open card, or a focus-and-expand deep link: dismiss the card, frame the pin, go full-screen. */
  expandMapOnRestaurant: (restaurantId: string) => void;
  /** Clear the drawn route AND deselect the pin. */
  clearRoute: () => void;
  /** Recenter the map on the user's location dot, zoomed into their area. */
  centerOnMe: () => void;
}

const DiscoverSharedContext = createContext<DiscoverShared | null>(null);

/**
 * Discover's map/sheet/route state used to live in one component (`explore.tsx`)
 * that branched internally between Discover, Platos, and Ranks — sharing all of
 * this by closure for free. Now that Platos is its own pager page (a separate
 * mounted component, for a real live-content swipe), this lifts that shared
 * slice up so both `DiscoverContent` and `PlatosContent` can still reach it.
 */
export function DiscoverSharedProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { restaurantFor, ensureRestaurant } = useData();
  const { location } = useLocation();
  const { openSaveSheet } = useCollections();
  const { setMode } = useExploreMode();
  const { jumpTo } = useMainPagerControl();

  const mapRef = useRef<MapView>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);
  const [sheetSide, setSheetSide] = useState<'place' | 'plate'>('place');
  const [preview, setPreview] = useState<PlaceResult | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [route, setRoute] = useState<RouteWithDestination | null>(null);
  const [routing, setRouting] = useState(false);

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
    // to then say "couldn't build a route" would have rearranged the screen
    // for nothing. Stays collapsed to the compact route card rather than
    // forcing full screen — tapping it opens the full map, already fitted.
    setMode('discover');
    jumpTo('discover');
    setSelectedRestaurant(null);
    setRoute({ ...result, destination: dest });
    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(result.coordinates, {
        edgePadding: SMALL_MAP_ROUTE_PADDING,
        animated: true,
      });
    });
  };

  /** Expand the map full-screen, re-fitting to the drawn route (looser small-map padding doesn't read right at full size). */
  const expandMap = () => {
    setMapExpanded(true);
    if (route) {
      requestAnimationFrame(() => {
        mapRef.current?.fitToCoordinates(route.coordinates, {
          edgePadding: FULLSCREEN_ROUTE_PADDING,
          animated: true,
        });
      });
    }
  };

  const clearRoute = () => {
    setRoute(null);
    setHighlighted(null);
  };

  const routeToRestaurant = (restaurantId: string) => {
    const r = restaurantFor(restaurantId);
    if (r?.lat == null || r?.lng == null) {
      showAlert('No coordinates', "We don't have this place's location yet.");
      return;
    }
    startRoute({ restaurantId, name: r.name, lat: r.lat, lng: r.lng });
  };

  const focusRestaurant = (restaurantId: string) => {
    const r = restaurantFor(restaurantId);
    if (r?.lat == null || r?.lng == null) return;
    mapRef.current?.animateCamera({ center: { latitude: r.lat, longitude: r.lng } }, { duration: 350 });
  };

  const openPlate = (orderId: string, restaurantId: string) => {
    tapLight();
    setSelectedPlate(orderId);
    setSheetSide('plate');
    focusRestaurant(restaurantId);
    setHighlighted(restaurantId);
    setSelectedRestaurant(restaurantId);
  };

  const openPin = (restaurantId: string) => {
    tapLight();
    setSelectedPlate(null);
    setSheetSide('place');
    setHighlighted(restaurantId);
    setSelectedRestaurant(restaurantId);
    setMapFocus(null);
  };

  const closeSheet = () => {
    setSelectedRestaurant(null);
    setPreview(null);
    setSelectedPlate(null);
    setHighlighted(null);
  };

  const openPreview = (place: PlaceResult) => {
    setSelectedRestaurant(null);
    setSelectedPlate(null);
    setHighlighted(null);
    setPreview(place);
    if (place.lat != null && place.lng != null) {
      mapRef.current?.animateCamera({ center: { latitude: place.lat, longitude: place.lng }, zoom: 15 }, { duration: 400 });
    }
  };

  const adoptPreview = async (place: PlaceResult, then: 'save' | 'plate') => {
    if (then === 'plate') {
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

  const expandMapOnRestaurant = (restaurantId: string) => {
    setSelectedRestaurant(null);
    setSelectedPlate(null);
    setHighlighted(restaurantId);
    setMapFocus(restaurantId);
    setMapExpanded(true);
  };

  const centerOnMe = () => {
    if (location.lat == null || location.lng == null) {
      showAlert('Location needed', 'Set your location so Plated can center the map on you.');
      return;
    }
    mapRef.current?.animateToRegion({ latitude: location.lat, longitude: location.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 350);
  };

  const value: DiscoverShared = {
    mapRef,
    selectedRestaurant,
    selectedPlate,
    sheetSide,
    setSheetSide,
    preview,
    highlighted,
    mapFocus,
    mapExpanded,
    setMapExpanded,
    expandMap,
    route,
    routing,
    openPin,
    openPlate,
    closeSheet,
    startRoute,
    routeToRestaurant,
    adoptPreview,
    openPreview,
    focusRestaurant,
    expandMapOnRestaurant,
    clearRoute,
    centerOnMe,
  };

  return <DiscoverSharedContext.Provider value={value}>{children}</DiscoverSharedContext.Provider>;
}

export function useDiscoverShared() {
  const ctx = useContext(DiscoverSharedContext);
  if (!ctx) throw new Error('useDiscoverShared must be used within DiscoverSharedProvider');
  return ctx;
}
