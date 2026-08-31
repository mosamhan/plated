import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, LayoutAnimation, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Region } from 'react-native-maps';

import { ActivityRail } from '@/components/ActivityRail';
import { ActionSheet } from '@/components/ActionSheet';
import { CraveFilterSheet } from '@/components/CraveFilterSheet';
import { CuisineFilterRow, type CuisineFilterValue } from '@/components/CuisineFilterRow';
import { DiscoverSettingsSheet } from '@/components/DiscoverSettingsSheet';
import { ModeToggle } from '@/components/discover/ModeToggle';
import { ExclusiveDealsRail } from '@/components/ExclusiveDealsRail';
import { ExploreMap, type MapRestaurant } from '@/components/ExploreMap';
import { InlineSearch } from '@/components/InlineSearch';
import { LocalFavoritesRail } from '@/components/LocalFavoritesRail';
import { CategoriesSheet, CollectionsSheet, MapSettingsSheet } from '@/components/MapSheets';
import { PlateTile } from '@/components/PlateTile';
import { PlatosDiscoverSection, type PlatosDiscoverSectionHandle } from '@/components/PlatosDiscoverSection';
import { RankLocationSheet, type RankLocation } from '@/components/RankLocationSheet';
import { RankSettingsSheet } from '@/components/RankSettingsSheet';
import { RanksView } from '@/components/RanksView';
import { RestaurantDetailSheet } from '@/components/RestaurantDetailSheet';
import { RouteStepsSheet } from '@/components/RouteStepsSheet';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton } from '@/components/Skeleton';
import { useNearFilter, type DiscoverScope } from '@/hooks/useNearFilter';
import { openDirections } from '@/lib/external';
import { computeHighlights, trendingScore } from '@/lib/highlights';
import { LOVED_RATING, placeTypeFor, type PlaceStatus } from '@/lib/placeType';
import { TAB_BAR_BOTTOM_MARGIN, TAB_BAR_HEIGHT } from '@/lib/sections';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { useDiscoverShared } from '@/store/DiscoverSharedContext';
import { useExploreMode } from '@/store/ExploreModeContext';
import { useLocation } from '@/store/LocationContext';
import { useSettings } from '@/store/SettingsContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const GAP = spacing.md;
const PADDING = spacing.lg;
/** Diameter of the round map controls; "Search this area" centres against it. */
const MAP_CIRCLE = 44;
/** How far bottom-anchored full-screen-map controls need to clear the floating tab bar. */
const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + 12;
/** Locate button geometry — "Search this area" stacks directly under it, so its
 * offset is derived from these rather than a second hand-tuned number. */
const LOCATE_STACK_GAP = 12;
/** areaBtn's rendered height (paddingVertical 8 * 2 + its text line) — it has
 * no fixed height, so this is measured-in-practice, not a layout constant. */
const AREA_HEIGHT = 36;
const LOCATE_BOTTOM_BASE = 60;
const LOCATE_BOTTOM_BASE_WITH_ROUTE = 106;

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

/** Discover + Ranks — the map as a live window over the plates it's showing, and the leaderboard, which shares this page rather than owning a tab of its own. */
export function DiscoverContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const { exploreOrders, topRestaurants, ordersByRestaurant, restaurantFor, currentUser, placementsFor } = useData();
  const { location } = useLocation();
  const { settings, update } = useSettings();
  const { isSaved } = useCollections();
  const { mode, setMode } = useExploreMode();
  const {
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
    expandMapOnRestaurant,
    clearRoute,
    centerOnMe,
  } = useDiscoverShared();

  // Discover's own near/global scope — separate from Ranks' below, opened
  // from Discover Settings (the location chip) rather than Ranks Settings.
  // Defaults to near: Discover's whole pitch is "what's around you", so
  // global is the opt-in, not the default.
  const [discoverScope, setDiscoverScope] = useState<DiscoverScope>('near');
  const [discoverNearLocation, setDiscoverNearLocation] = useState<RankLocation | null>(null);
  const [discoverSettingsOpen, setDiscoverSettingsOpen] = useState(false);
  const [discoverLocationOpen, setDiscoverLocationOpen] = useState(false);
  // Ranks' own scope — lifted up here so its toggle can live in the shared
  // header pill row instead of buried in RanksView's body.
  const [rankScope, setRankScope] = useState<'near' | 'global'>('global');
  // A picked city overriding "near" — scoped to Ranks, doesn't touch the
  // app-wide location setting the Discover map uses.
  const [nearLocation, setNearLocation] = useState<RankLocation | null>(null);
  const [rankLocationOpen, setRankLocationOpen] = useState(false);
  // What Ranks is ranking — defaults to restaurants; changed from the Ranks
  // settings sheet (opened via the header's location chip), not a popup.
  const [rankKind, setRankKind] = useState<'restaurants' | 'plates'>('restaurants');
  const [rankSettingsOpen, setRankSettingsOpen] = useState(false);
  // A skeleton is for waiting on data. Coming back to Explore the plates are
  // already in the context, so the old unconditional 400ms of skeleton was
  // showing placeholder tiles over content that existed — and swapping them out
  // is what made the grid visibly jump. Only wait when there's nothing to show.
  const [booting, setBooting] = useState(() => exploreOrders('All').length === 0);
  useEffect(() => {
    if (!booting) return;
    const t = setTimeout(() => setBooting(false), 400);
    return () => clearTimeout(t);
  }, [booting]);

  // The Platos section's own play/pause decisions live entirely inside it —
  // this ref is just the page's scroll heartbeat, so scrolling doesn't
  // re-render all of Discover just to tell a few video tiles to check
  // themselves.
  const platosSectionRef = useRef<PlatosDiscoverSectionHandle>(null);

  // Map state (design §1 + §"State").
  const [mapQuery] = useState('');
  /** One cuisine at a time, "overall" meaning no filter — same rail and rule as Ranks/My rankings. */
  const [cuisineFilter, setCuisineFilter] = useState<CuisineFilterValue>('overall');
  /** The "More" chip's free-text guesser — see CraveFilterSheet. */
  const [craveOpen, setCraveOpen] = useState(false);
  /** Empty means "don't filter by history" — not "show nothing". */
  const [activeStatuses, setActiveStatuses] = useState<PlaceStatus[]>([]);
  const [myTableOnly, setMyTableOnly] = useState(false);
  // Map appearance can be overridden independently of the app theme (design §3).
  const [mapThemeOverride, setMapThemeOverride] = useState<'light' | 'dark' | null>(null);
  const [activeSheet, setActiveSheet] = useState<null | 'settings' | 'collections' | 'categories'>(null);
  /** Where the camera is now, vs. the area the list is actually filtered to. */
  const [cameraRegion, setCameraRegion] = useState<Region | null>(null);
  const [areaRegion, setAreaRegion] = useState<Region | null>(null);
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
  const mapTheme: 'light' | 'dark' = mapThemeOverride ?? (colors.isDark ? 'dark' : 'light');

  const withinArea = (r: Region, lat: number, lng: number) =>
    Math.abs(lat - r.latitude) <= r.latitudeDelta / 2 && Math.abs(lng - r.longitude) <= r.longitudeDelta / 2;

  const userLocation = location.lat != null && location.lng != null ? { latitude: location.lat, longitude: location.lng } : null;

  // Discover's own "near" origin — a picked city if one was chosen in
  // Discover Settings, otherwise the app's own location (device fix or
  // manually set). No coords at all (the location default before anyone's
  // ever set one) means "near" simply can't filter, same fallback RanksView
  // already uses — global effectively, with a hint to set a real location.
  const discoverEffectiveLocation = discoverNearLocation ?? location;
  const discoverHasCoords = discoverEffectiveLocation.lat != null && discoverEffectiveLocation.lng != null;
  const discoverOrigin = discoverHasCoords
    ? { lat: discoverEffectiveLocation.lat!, lng: discoverEffectiveLocation.lng! }
    : null;
  const isNear = useNearFilter(discoverScope, discoverOrigin);

  // Directions closes the card first (clearing `preview`), so once a route to
  // an off-Plated place is drawn, its pin comes from the route's own
  // destination instead — reusing the same preview-pin marker rather than
  // losing the destination the moment the sheet dismisses.
  const previewPin =
    preview?.lat != null && preview?.lng != null
      ? { latitude: preview.lat, longitude: preview.lng, name: preview.name }
      : route && !route.destination.restaurantId
        ? { latitude: route.destination.lat, longitude: route.destination.lng, name: route.destination.name }
        : null;

  const data = useMemo(() => {
    let list = exploreOrders('All');
    // The cuisine row filters the grid as well as the pins — picking "Pizza"
    // and still being shown every plate in the city reads as the filter having
    // been ignored.
    if (cuisineFilter !== 'overall') {
      list = list.filter((o) => {
        const r = restaurantFor(o.restaurantId);
        return !!r && placeTypeFor(r.cuisine) === cuisineFilter;
      });
    }
    // Discover Settings' near/global scope.
    list = list.filter((o) => isNear(restaurantFor(o.restaurantId)));
    if (areaRegion) {
      // Only plates whose restaurant sits in the framed area. A plate whose
      // restaurant has no coordinates can't be placed, so it drops out rather
      // than pretending to be here.
      list = list.filter((o) => {
        const r = restaurantFor(o.restaurantId);
        return r?.lat != null && r?.lng != null && withinArea(areaRegion, r.lat, r.lng);
      });
    }
    // Trending leads, but it's ordering only — never a badge. Plates that
    // aren't trending keep their feed order behind the ones that are, so the
    // grid still ends in something rather than cutting off at the trend line.
    return [...list].sort((a, b) => trendingScore(b) - trendingScore(a));
  }, [exploreOrders, areaRegion, restaurantFor, cuisineFilter, isNear]);

  /** Badges are relative to each plate's *own* restaurant, so they're computed
   *  over everything rated there — not just what survived the page's filters. */
  const highlights = useMemo(() => computeHighlights(exploreOrders('All')), [exploreOrders]);

  const sponsoredPinIds = useMemo(() => new Set(placementsFor('map_pin').map((p) => p.restaurantId)), [placementsFor]);

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
          sponsored: sponsoredPinIds.has(r.id),
        };
      });
  }, [topRestaurants, ordersByRestaurant, isSaved, currentUser.id, sponsoredPinIds]);

  const visiblePins = useMemo(() => {
    const q = mapQuery.trim().toLowerCase();
    return mapRestaurants.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q) || r.location.toLowerCase().includes(q)) &&
        (cuisineFilter === 'overall' || r.type === cuisineFilter) &&
        // No status selected = no history filter, rather than an empty map.
        (activeStatuses.length === 0 || activeStatuses.some((st) => r.statuses.includes(st))) &&
        (!myTableOnly || r.saved),
    );
  }, [mapRestaurants, mapQuery, cuisineFilter, activeStatuses, myTableOnly]);

  // The map itself (embedded or expanded) always shows every matching pin
  // regardless of Discover's near/global toggle — panning somewhere far away
  // on purpose shouldn't hide what's actually there. Only the map *card*'s
  // "N restaurants near you" blurb reflects the toggle, so what it says lines
  // up with the plate grid below it rather than the map you'd see if you tapped in.
  const nearbyPins = useMemo(() => visiblePins.filter((r) => isNear(r)), [visiblePins, isNear]);

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
        onOpenMap={selectedRestaurant ? () => expandMapOnRestaurant(selectedRestaurant) : undefined}
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
          // platform's — the chooser opens the first time; after that we go
          // straight to whichever one they picked (see settings.preferredMapsApp).
          onNavigate={() => {
            setStepsOpen(false);
            if (settings.preferredMapsApp !== 'ask') {
              if (route) openDirections(settings.preferredMapsApp, route.destination);
            } else {
              setMapsChooserOpen(true);
            }
          }}
        />
      )}

      {/* Only reached on the first navigate — see onNavigate above. Coordinates
          come off the route's destination, which a Foursquare preview has even
          with no Plated row. */}
      <ActionSheet
        visible={mapsChooserOpen && !!route}
        onClose={() => setMapsChooserOpen(false)}
        title={route ? `Navigate to ${route.destination.name}` : undefined}
        actions={[
          {
            label: 'Google Maps',
            logo: require('../../../assets/images/providers/google-maps.png'),
            icon: 'navigate',
            onPress: () => {
              if (settings.preferredMapsApp === 'ask') update('preferredMapsApp', 'google');
              if (route) openDirections('google', route.destination);
            },
          },
          {
            label: 'Apple Maps',
            logo: require('../../../assets/images/providers/apple.png'),
            icon: 'map',
            onPress: () => {
              if (settings.preferredMapsApp === 'ask') update('preferredMapsApp', 'apple');
              if (route) openDirections('apple', route.destination);
            },
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

  // Ranks — the leaderboard, which shares this page rather than owning one of
  // its own: all three (Discover/Ranks/Platos) answer "what's good", just at
  // different scales. Same header shape as Discover — mode pill left, a
  // secondary pill right — just the right side opens the Ranks settings menu
  // (what to rank, and where) instead of just labeling the location.
  if (mode === 'ranks') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <View style={styles.titleRow}>
            <ModeToggle mode={mode} setMode={setMode} />
            {/* Opens the settings menu — Restaurants/Plates and Near/Global
                used to be a popup and a separate pill; now it's one place. */}
            <Pressable onPress={() => setRankSettingsOpen(true)} style={styles.rankLocChip}>
              <Ionicons name="location" size={13} color={colors.accent} />
              <Text style={[styles.locText, { color: colors.textMuted }]} numberOfLines={1}>
                {rankScope === 'global' ? 'Global' : nearLocation ? nearLocation.label : location.label}
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
        <RanksView embedded scope={rankScope} nearLocation={nearLocation} kind={rankKind} onOpenRestaurant={openPin} onOpenPlate={openPlate} />

        <RankSettingsSheet
          visible={rankSettingsOpen}
          onClose={() => setRankSettingsOpen(false)}
          kind={rankKind}
          onChangeKind={setRankKind}
          scope={rankScope}
          onChangeScope={setRankScope}
          nearLabel={nearLocation ? nearLocation.label : location.label}
          onEditNearLocation={() => {
            setRankSettingsOpen(false);
            setTimeout(() => setRankLocationOpen(true), 300);
          }}
        />

        <RankLocationSheet
          visible={rankLocationOpen}
          onClose={() => setRankLocationOpen(false)}
          onBack={() => {
            setRankLocationOpen(false);
            setTimeout(() => setRankSettingsOpen(true), 300);
          }}
          onSelect={(loc) => {
            setNearLocation(loc);
            setRankLocationOpen(false);
          }}
          onUseDeviceLocation={() => {
            setNearLocation(null);
            setRankLocationOpen(false);
          }}
        />

        {overlays}
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
            Icon-only, matching the menu/search circles above it — a text pill
            here was the odd one out. Opened from a card's Map button, this
            reads as "back to that card"; otherwise it collapses to Discover. */}
        <Pressable
          onPress={() => {
            if (mapFocus) {
              openPin(mapFocus);
            } else {
              setMapExpanded(false);
            }
          }}
          style={[
            styles.mapCircle,
            {
              position: 'absolute',
              left: PADDING,
              top: insets.top + 14 + MAP_CIRCLE + 10,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Ionicons name={mapFocus ? 'arrow-back' : 'contract'} size={18} color={colors.text} />
        </Pressable>

        {/* Stacked directly under the locate button, both on the bottom-right,
            clear of the floating tab bar. Hidden alongside it whenever a
            route's up (the route banner takes that space instead). */}
        {!route && (
          <View
            style={[
              styles.bottomRightWrap,
              { bottom: LOCATE_BOTTOM_BASE - LOCATE_STACK_GAP - AREA_HEIGHT + insets.bottom + TAB_BAR_CLEARANCE },
            ]}>
            {searchThisArea}
          </View>
        )}

        {/* In-app route banner — distance + ETA, with clear + hand-off options. */}
        {route && (
          <View
            style={[
              styles.routeBanner,
              { bottom: 16 + insets.bottom + TAB_BAR_CLEARANCE, backgroundColor: colors.card, borderColor: colors.border },
            ]}>
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
            <Pressable onPress={() => setStepsOpen(true)} style={[styles.routeGo, { backgroundColor: colors.accent }]}>
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
            {
              bottom: (route ? LOCATE_BOTTOM_BASE_WITH_ROUTE : LOCATE_BOTTOM_BASE) + insets.bottom + TAB_BAR_CLEARANCE,
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
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
        {/* The pill stands in for the title itself now, rather than sitting
            above it as a second row. */}
        <View style={styles.titleRow}>
          <ModeToggle mode={mode} setMode={setMode} />
          {/* Opens Discover Settings (near/global) — same shape as Ranks'
              own location chip → Ranks Settings. The map's own controls menu
              (menu button) only makes sense once the map is actually open,
              so this is the only place Discover itself picks near vs global. */}
          <Pressable onPress={() => setDiscoverSettingsOpen(true)} style={styles.locChip} hitSlop={8}>
            <Ionicons name="location" size={13} color={colors.accent} />
            <Text style={[styles.locText, { color: colors.textMuted }]} numberOfLines={1}>
              {discoverScope === 'global' ? 'Global' : discoverNearLocation ? discoverNearLocation.label : location.label}
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Looks like the same search field, but Discover's own search is now
            a dedicated full-screen experience (plates/Platos/restaurants/
            people, nearby-first) rather than an inline restaurant-only
            dropdown — that dropdown still lives inside the expanded map,
            unchanged, where restaurant-only makes sense. */}
        <Pressable
          onPress={() => router.push('/search')}
          style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <Text style={[styles.searchBarText, { color: colors.textMuted }]} numberOfLines={1}>
            Search dishes, drinks, places, people
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={booting ? [] : data}
        key="grid"
        numColumns={2}
        keyExtractor={(o) => o.id}
        columnWrapperStyle={{ paddingHorizontal: PADDING, gap: GAP }}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom, gap: GAP }}
        showsVerticalScrollIndicator={false}
        // The Platos section's own videos need to know when they're on
        // screen — this just pokes it to re-check, at a cadence cheap enough
        // not to matter mid-scroll.
        onScroll={() => platosSectionRef.current?.tick()}
        scrollEventThrottle={100}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(220)}>
            <PlateTile
              order={item}
              width={tileWidth}
              selected={item.id === selectedPlate}
              highlight={highlights.get(item.id)}
              onPress={() => openPlate(item.id, item.restaurantId)}
            />
          </Animated.View>
        )}
        ListHeaderComponent={
          <>
            {/* A static entry point rather than an always-live embedded map — a
                list-first, tap-to-explore feel, and avoids double-mounting a map
                just to tease it. A route in progress shows its own summary card
                instead of the restaurant count; either way, tapping opens the
                same unchanged full map (ExploreMap), just from a smaller start. */}
            {route ? (
              <Pressable
                onPress={expandMap}
                style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.mapCardIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="navigate" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mapCardTitle, { color: colors.text }]} numberOfLines={1}>
                    {route.destination.name}
                  </Text>
                  <Text style={[styles.mapCardSub, { color: colors.textMuted }]} numberOfLines={1}>
                    {route.distanceText} · {route.durationText} drive
                  </Text>
                </View>
                <Pressable
                  onPress={() => setStepsOpen(true)}
                  hitSlop={10}
                  style={[styles.miniSteps, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="list" size={13} color={colors.accent} />
                  <Text style={[styles.miniStepsText, { color: colors.accent }]}>Steps</Text>
                </Pressable>
                <Pressable onPress={clearRoute} hitSlop={10} style={{ paddingHorizontal: 2 }}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setMapExpanded(true)}
                style={[styles.mapCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.mapCardIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="map" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mapCardTitle, { color: colors.text }]}>
                    {discoverScope === 'near'
                      ? `${nearbyPins.length} ${nearbyPins.length === 1 ? 'restaurant' : 'restaurants'} near you`
                      : `${visiblePins.length} ${visiblePins.length === 1 ? 'restaurant' : 'restaurants'} on Plated`}
                  </Text>
                  <Text style={[styles.mapCardSub, { color: colors.textMuted }]}>
                    {discoverScope === 'near' && nearbyPins.length === 0 && discoverHasCoords
                      ? 'Nothing within range yet — tap to browse the map'
                      : 'Tap to explore the map'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            )}

            {/* Cuisine filter, inline rather than two sheets deep — same rail
                as Ranks/My rankings, one cuisine at a time. Filters the grid
                as well as the full map's pins. */}
            <CuisineFilterRow
              value={cuisineFilter}
              onChange={setCuisineFilter}
              showOverall={false}
              trailing={
                <Pressable onPress={() => setCraveOpen(true)} style={styles.moreChip}>
                  <View style={[styles.moreChipIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
                  </View>
                  <Text style={[styles.moreChipText, { color: colors.textMuted }]}>More</Text>
                </Pressable>
              }
            />

            <ExclusiveDealsRail
              onPress={openPin}
              scope={discoverScope}
              origin={discoverOrigin}
              cuisine={cuisineFilter}
              onSeeAll={() =>
                router.push(
                  `/discover-deals?scope=${discoverScope}${discoverOrigin ? `&lat=${discoverOrigin.lat}&lng=${discoverOrigin.lng}` : ''}`,
                )
              }
            />

            <LocalFavoritesRail onPress={openPin} scope={discoverScope} origin={discoverOrigin} cuisine={cuisineFilter} />

            <ActivityRail
              onPress={(orderId) => router.push(`/order/${orderId}`)}
              scope={discoverScope}
              origin={discoverOrigin}
              cuisine={cuisineFilter}
              onSeeAll={() =>
                router.push(
                  `/discover-activity?scope=${discoverScope}${discoverOrigin ? `&lat=${discoverOrigin.lat}&lng=${discoverOrigin.lng}` : ''}`,
                )
              }
            />

            <PlatosDiscoverSection
              ref={platosSectionRef}
              scope={discoverScope}
              origin={discoverOrigin}
              cuisine={cuisineFilter}
              onSeeAll={() => router.push('/search?tab=Platos')}
            />

            {/* Plates gets the same header treatment as Platos above it, so
                the two read as sibling sections rather than one titled
                section followed by a loose grid. */}
            <SectionHeader
              title="Plates"
              subtitle={areaRegion ? 'In this area' : 'Rated by the community'}
              actionLabel="See all"
              onAction={() => router.push('/search?tab=Plates')}
            />

            {areaRegion && (
              <View style={styles.countRow}>
                <Text style={[styles.count, { color: colors.textMuted }]}>
                  {data.length} {data.length === 1 ? 'plate' : 'plates'} in this area
                </Text>
                <Pressable onPress={() => setAreaRegion(null)} hitSlop={6}>
                  <Text style={[styles.clearArea, { color: colors.accent }]}>Clear area</Text>
                </Pressable>
              </View>
            )}
            {booting && <ExploreGridSkeleton width={tileWidth} />}
          </>
        }
        ListEmptyComponent={
          booting ? null : (
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                {areaRegion
                  ? 'No plates in this part of the map yet.'
                  : discoverScope === 'near'
                    ? 'No plates within range yet.'
                    : 'No plates for this filter yet.'}
              </Text>
              {!areaRegion && discoverScope === 'near' && (
                <Pressable onPress={() => setDiscoverSettingsOpen(true)} hitSlop={8}>
                  <Text style={[styles.emptyAction, { color: colors.accent }]}>Try Global instead</Text>
                </Pressable>
              )}
            </View>
          )
        }
      />

      <DiscoverSettingsSheet
        visible={discoverSettingsOpen}
        onClose={() => setDiscoverSettingsOpen(false)}
        scope={discoverScope}
        onChangeScope={setDiscoverScope}
        nearLabel={discoverNearLocation ? discoverNearLocation.label : location.label}
        onEditNearLocation={() => {
          setDiscoverSettingsOpen(false);
          setTimeout(() => setDiscoverLocationOpen(true), 300);
        }}
      />

      <RankLocationSheet
        visible={discoverLocationOpen}
        title="Browse near a city"
        onClose={() => setDiscoverLocationOpen(false)}
        onBack={() => {
          setDiscoverLocationOpen(false);
          setTimeout(() => setDiscoverSettingsOpen(true), 300);
        }}
        onSelect={(loc) => {
          setDiscoverNearLocation(loc);
          setDiscoverLocationOpen(false);
        }}
        onUseDeviceLocation={() => {
          setDiscoverNearLocation(null);
          setDiscoverLocationOpen(false);
        }}
      />

      <CraveFilterSheet
        visible={craveOpen}
        onClose={() => setCraveOpen(false)}
        onGuess={setCuisineFilter}
        onFallback={(term) => router.push(`/search?q=${encodeURIComponent(term)}`)}
      />

      {overlays}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The pinned chrome. It needs its own bottom edge and padding because the
   * page scrolls underneath it — without them the plate grid slides up flush
   * against the search field with nothing separating the two.
   */
  header: { paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 46,
    marginHorizontal: PADDING,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchBarText: { fontSize: 14, fontWeight: '500' },
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: PADDING,
    marginTop: 16,
    marginBottom: spacing.lg,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mapCardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mapCardTitle: { fontSize: 14, fontWeight: '800' },
  mapCardSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  moreChip: { alignItems: 'center', width: 68 },
  moreChipIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  moreChipText: { fontSize: 11, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  miniSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  miniStepsText: { fontSize: 12, fontWeight: '800' },
  bottomRightWrap: { position: 'absolute', right: spacing.lg, alignItems: 'flex-end' },
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
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 130, flexShrink: 1 },
  rankLocChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150, flexShrink: 1 },
  locText: { fontSize: 13, fontWeight: '700' },
  count: { fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
  emptyAction: { textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: '800' },
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
