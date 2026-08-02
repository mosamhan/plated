import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExploreMap, deriveCategory, type MapRestaurant, type PinCategory } from '@/components/ExploreMap';
import { FilterChips } from '@/components/FilterChips';
import { InlineSearch } from '@/components/InlineSearch';
import { CategoriesSheet, CollectionsSheet, MapSettingsSheet } from '@/components/MapSheets';
import { PlateTile } from '@/components/PlateTile';
import { PlatosFeed } from '@/components/PlatosFeed';
import { RestaurantDetailSheet } from '@/components/RestaurantDetailSheet';
import { RouteStepsSheet } from '@/components/RouteStepsSheet';
import { fetchRoute, type RouteResult } from '@/lib/directions';
import type { PlaceResult } from '@/lib/places';
import { isCafe } from '@/lib/venue';
import { openMap } from '@/lib/external';
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
      <Pressable onPress={() => setMode(m)} style={[styles.segCompact, on && { backgroundColor: colors.accent }]}>
        <Ionicons name={icon} size={15} color={on ? colors.accentText : inactive} />
        {on && <Text style={[styles.segText, { color: colors.accentText }]}>{label}</Text>}
      </Pressable>
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

export default function Explore() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const { exploreOrders, topRestaurants, ordersByRestaurant, restaurantFor, ensureRestaurant } = useData();
  const { location } = useLocation();
  const { isSaved, openSaveSheet } = useCollections();
  const mapRef = useRef<MapView>(null);
  const [filter, setFilter] = useState('Trending');
  const [mode, setMode] = useState<Mode>('discover');

  // Map state (design §1 + §"State").
  const [mapQuery, setMapQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<PinCategory[]>(['cafe', 'loved', 'been', 'dining']);
  const [myTableOnly, setMyTableOnly] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [avoidTolls, setAvoidTolls] = useState(false);
  // Map appearance can be overridden independently of the app theme (design §3).
  const [mapThemeOverride, setMapThemeOverride] = useState<'light' | 'dark' | null>(null);
  const [activeSheet, setActiveSheet] = useState<null | 'settings' | 'collections' | 'categories'>(null);
  const [route, setRoute] = useState<(RouteResult & { restaurantId: string }) | null>(null);
  // The map is a window inside Discover; expanding is a state of it, not a mode.
  const [mapExpanded, setMapExpanded] = useState(false);
  // Drag-resizable, because how much map you want depends on whether you're
  // reading the list or working the map. The ref mirrors it so the pan handler
  // isn't rebuilt (and doesn't go stale) on every pixel of a drag.
  const [mapHeight, setMapHeight] = useState(MAP_HEIGHT_DEFAULT);
  const mapHeightRef = useRef(MAP_HEIGHT_DEFAULT);
  const dragFrom = useRef(MAP_HEIGHT_DEFAULT);
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

  // Draw a driving route from the user to a restaurant, inside the app: fetch
  // the Directions polyline, close the overlay, and fit the camera to the line.
  const startRoute = async (restaurantId: string) => {
    const dest = restaurantFor(restaurantId);
    if (location.lat == null || location.lng == null) {
      showAlert('Location needed', 'Set your location so Plated can draw a route from where you are.');
      return;
    }
    if (dest?.lat == null || dest?.lng == null) {
      showAlert('No coordinates', "We don't have this place's location yet.");
      return;
    }
    setRouting(true);
    const result = await fetchRoute(
      { latitude: location.lat, longitude: location.lng },
      { latitude: dest.lat, longitude: dest.lng },
      { avoidTolls },
    );
    setRouting(false);
    if (!result) {
      showAlert('Could not build a route', 'Please try again in a moment.');
      return;
    }
    setSelectedRestaurant(null);
    setRoute({ ...result, restaurantId });
    requestAnimationFrame(() => {
      mapRef.current?.fitToCoordinates(result.coordinates, {
        edgePadding: { top: 120, right: 60, bottom: 200, left: 60 },
        animated: true,
      });
    });
  };

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

  const mapMax = Math.round(windowHeight * 0.52);
  const resizeMap = (h: number) => {
    const next = Math.max(MAP_HEIGHT_MIN, Math.min(mapMax, h));
    mapHeightRef.current = next;
    setMapHeight(next);
  };

  const resizer = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          dragFrom.current = mapHeightRef.current;
        },
        onPanResponderMove: (_, g) => resizeMap(dragFrom.current + g.dy),
      }),
    // resizeMap only reads refs and the clamp bound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapMax],
  );

  const data = useMemo(() => {
    const list = exploreOrders(filter);
    if (!areaRegion) return list;
    // Only plates whose restaurant sits in the framed area. A plate whose
    // restaurant has no coordinates can't be placed, so it drops out rather
    // than pretending to be here.
    return list.filter((o) => {
      const r = restaurantFor(o.restaurantId);
      return r?.lat != null && r?.lng != null && withinArea(areaRegion, r.lat, r.lng);
    });
  }, [exploreOrders, filter, areaRegion, restaurantFor]);

  // Restaurants that have coordinates, tagged with their per-user category.
  const mapRestaurants = useMemo<MapRestaurant[]>(() => {
    return topRestaurants()
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        const saved = isSaved({ type: 'restaurant', id: r.id });
        const rated = ordersByRestaurant(r.id).length > 0;
        return {
          ...r,
          lat: r.lat as number,
          lng: r.lng as number,
          saved,
          category: deriveCategory({ saved, rated, isCafe: isCafe(r.cuisine) }),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topRestaurants, ordersByRestaurant, isSaved]);

  const visiblePins = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    return mapRestaurants.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q) || r.location.toLowerCase().includes(q)) &&
        activeTypes.includes(r.category) &&
        (!myTableOnly || r.saved),
    );
  }, [mapRestaurants, mapQuery, activeTypes, myTableOnly]);

  const region: Region = useMemo(() => {
    if (location.lat != null && location.lng != null) {
      return { latitude: location.lat, longitude: location.lng, latitudeDelta: 0.09, longitudeDelta: 0.09 };
    }
    return DEFAULT_REGION;
  }, [location.lat, location.lng]);

  /** Frame a restaurant on the map without changing the zoom the user chose. */
  const focusRestaurant = (restaurantId: string) => {
    const r = restaurantFor(restaurantId);
    if (r?.lat == null || r?.lng == null) return;
    mapRef.current?.animateCamera({ center: { latitude: r.lat, longitude: r.lng } }, { duration: 350 });
  };

  /** A plate was tapped: pin its restaurant and open the sheet on the plate. */
  const openPlate = (orderId: string, restaurantId: string) => {
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
    setSelectedPlate(null);
    setSheetSide('place');
    setHighlighted(restaurantId);
    setSelectedRestaurant(restaurantId);
  };

  // Closes the sheet only — the pin stays ringed and the tile stays outlined, so
  // dismissing it reveals the answer to "where is this?" rather than undoing it.
  const closeSheet = () => {
    setSelectedRestaurant(null);
    setPreview(null);
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
        avoidTolls={avoidTolls}
        onRoute={startRoute}
        plateId={selectedPlate}
        side={sheetSide}
        onSideChange={setSheetSide}
        preview={preview}
        onAdopt={adoptPreview}
      />

      {route && (
        <RouteStepsSheet
          visible={stepsOpen}
          onClose={() => setStepsOpen(false)}
          destination={restaurantFor(route.restaurantId)?.name ?? 'Route'}
          distanceText={route.distanceText}
          durationText={route.durationText}
          steps={route.steps}
          onNavigate={() => {
            const r = restaurantFor(route.restaurantId);
            setStepsOpen(false);
            if (r) openMap(r);
          }}
        />
      )}

      {activeSheet === 'settings' && (
        <MapSettingsSheet
          onClose={() => setActiveSheet(null)}
          mapTheme={mapTheme}
          setMapTheme={setMapThemeOverride}
          avoidTolls={avoidTolls}
          setAvoidTolls={setAvoidTolls}
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
        <CategoriesSheet onClose={() => setActiveSheet(null)} activeTypes={activeTypes} setActiveTypes={setActiveTypes} />
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
        <PlatosFeed bottomInset={12} />
        <View style={[styles.overlayToggle, { top: insets.top + 8 }]}>
          <ModeToggle mode={mode} setMode={setMode} overlay />
        </View>
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
            take, and stacking these two keeps the map controls in one corner. */}
        <Pressable
          onPress={() => setMapExpanded(false)}
          style={[
            styles.underMenu,
            { top: insets.top + 14 + 44 + 10, backgroundColor: colors.card, borderColor: colors.border },
            // While the search is open it drops its label and matches the menu
            // circle above it. That keeps it entirely left of the results list,
            // which starts just right of the menu — so the two never overlap
            // rather than one being drawn over the other.
            fullSearchOpen && styles.underMenuTight,
          ]}>
          <Ionicons name="contract" size={15} color={colors.text} />
          {!fullSearchOpen && (
            <Text style={[styles.collapseText, { color: colors.text }]}>Show plates</Text>
          )}
        </Pressable>

        {!route && <View style={[styles.areaWrap, { top: insets.top + 128 }]}>{searchThisArea}</View>}

        {/* In-app route banner — distance + ETA, with clear + hand-off options. */}
        {route && (
          <View style={[styles.routeBanner, { bottom: 16, backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.routeIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="navigate" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeTitle, { color: colors.text }]} numberOfLines={1}>
                {restaurantFor(route.restaurantId)?.name ?? 'Route'}
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
            <Pressable onPress={() => setRoute(null)} hitSlop={8} style={styles.routeClose}>
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

        {overlays}
      </View>
    );
  }

  // Discover — the map as a live window over the plates it's showing.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8 }}>
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
          <Pressable
            onPress={() => setActiveSheet('settings')}
            style={[styles.menuSquare, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="menu" size={20} color={colors.text} />
            <View style={[styles.menuBadge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
              <Ionicons name={myTableOnly ? 'bookmark' : 'earth'} size={9} color={colors.accentText} />
            </View>
          </Pressable>
          <InlineSearch onSelectRated={openPin} onSelectExternal={openPreview} />
        </View>

        {/* The map window. Pinned rather than part of the scroll content: tapping
            a plate highlights its pin, which is useless if the map has scrolled
            away. */}
        <View style={[styles.mapWindow, { borderColor: colors.border, height: mapHeight }]}>
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
            <Pressable
              onPress={() => setMapExpanded(true)}
              hitSlop={6}
              style={[styles.expandBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="expand" size={16} color={colors.text} />
            </Pressable>
          )}
          {!route && <View style={styles.areaWrapInline}>{searchThisArea}</View>}

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
                  {restaurantFor(route.restaurantId)?.name ?? 'Route'}
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
                onPress={() => setRoute(null)}
                hitSlop={10}
                style={{ paddingHorizontal: 2 }}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </Pressable>
          )}
        </View>

        {/* Resize grip. Outside the map so the drag isn't competing with the
            map's own pan gesture. */}
        <View {...resizer.panHandlers} style={styles.grip} hitSlop={{ top: 6, bottom: 6 }}>
          <View style={[styles.gripBar, { backgroundColor: colors.border }]} />
        </View>

        <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      <FlatList
        data={data}
        key="grid"
        numColumns={2}
        keyExtractor={(o) => o.id}
        columnWrapperStyle={{ paddingHorizontal: PADDING, gap: GAP }}
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 110, gap: GAP }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <PlateTile
            order={item}
            width={tileWidth}
            selected={item.id === selectedPlate}
            onPress={() => openPlate(item.id, item.restaurantId)}
          />
        )}
        ListHeaderComponent={
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
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {areaRegion ? 'No plates in this part of the map yet.' : 'No plates for this filter yet.'}
          </Text>
        }
      />

      {overlays}
    </View>
  );
}

const MAP_HEIGHT_DEFAULT = 220;
const MAP_HEIGHT_MIN = 130;

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
  mapWindow: {
    marginHorizontal: PADDING,
    marginTop: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
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
  grip: { alignItems: 'center', justifyContent: 'center', height: 22 },
  gripBar: { width: 44, height: 4, borderRadius: 2 },
  areaWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
