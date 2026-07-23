import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { MapSearchOverlay } from '@/components/MapSearchOverlay';
import { CategoriesSheet, CollectionsSheet, MapSettingsSheet } from '@/components/MapSheets';
import { PlateTile } from '@/components/PlateTile';
import { PlatosFeed } from '@/components/PlatosFeed';
import { RestaurantDetailSheet } from '@/components/RestaurantDetailSheet';
import { fetchRoute, type RouteResult } from '@/lib/directions';
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

type Mode = 'platos' | 'discover' | 'map';

// The mode toggle reads the same in every Explore mode: only the ACTIVE segment
// shows its label, the other two are icon-only. Keeps a consistent, compact
// shape whether you're on Discover, Platos, or Map.
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
      {seg('map', 'map', 'Map')}
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
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const { exploreOrders, topRestaurants, ordersByRestaurant, restaurantFor } = useData();
  const { location } = useLocation();
  const { isSaved } = useCollections();
  const mapRef = useRef<MapView>(null);
  const [filter, setFilter] = useState('Trending');
  const [mode, setMode] = useState<Mode>('discover');

  // Map state (design §1 + §"State").
  const [mapQuery, setMapQuery] = useState('');
  const [activeTypes, setActiveTypes] = useState<PinCategory[]>(['loved', 'been', 'dining']);
  const [myTableOnly, setMyTableOnly] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [avoidTolls, setAvoidTolls] = useState(false);
  // Map appearance can be overridden independently of the app theme (design §3).
  const [mapThemeOverride, setMapThemeOverride] = useState<'light' | 'dark' | null>(null);
  const [activeSheet, setActiveSheet] = useState<null | 'settings' | 'collections' | 'categories'>(null);
  const [route, setRoute] = useState<(RouteResult & { restaurantId: string }) | null>(null);
  const [routing, setRouting] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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

  const data = useMemo(() => exploreOrders(filter), [exploreOrders, filter]);

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
          category: deriveCategory({ saved, rated, priceLevel: r.priceLevel }),
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

  // Map — full-bleed map with floating control rows (design §1).
  if (mode === 'map') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ExploreMap
          ref={mapRef}
          restaurants={visiblePins}
          region={region}
          mapTheme={mapTheme}
          onSelect={(r) => setSelectedRestaurant(r.id)}
          routeCoords={route?.coordinates}
          routeColor={colors.accent}
        />

        {/* Top row: controls menu (left, single tap) · mode toggle · search bar
            (right). The menu holds filters/appearance/collections; its badge
            shows the active My-Table/Platers filter. */}
        <View style={[styles.mapTopRow, { top: insets.top + 14 }]}>
          <Pressable
            onPress={() => setActiveSheet('settings')}
            style={[styles.mapCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="menu" size={22} color={colors.text} />
            <View style={[styles.menuBadge, { backgroundColor: colors.accent, borderColor: colors.card }]}>
              <Ionicons name={myTableOnly ? 'bookmark' : 'earth'} size={9} color={colors.accentText} />
            </View>
          </Pressable>
          <ModeToggle mode={mode} setMode={setMode} overlay />
          <Pressable
            onPress={() => setSearchOpen(true)}
            style={[styles.mapSearch, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <Text style={[styles.mapSearchText, { color: colors.textMuted }]}>Search</Text>
          </Pressable>
        </View>

        {/* In-app route banner — distance + ETA, with clear + hand-off options.
            Sits above the tab bar; replaces the filter row while a route is up. */}
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
            <Pressable
              onPress={() => {
                const r = restaurantFor(route.restaurantId);
                if (r) openMap(r);
              }}
              style={[styles.routeGo, { backgroundColor: colors.accent }]}>
              <Ionicons name="navigate" size={14} color={colors.accentText} />
              <Text style={[styles.routeGoText, { color: colors.accentText }]}>Navigate</Text>
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

        <RestaurantDetailSheet
          restaurantId={selectedRestaurant}
          onClose={() => setSelectedRestaurant(null)}
          avoidTolls={avoidTolls}
          onRoute={startRoute}
        />

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
          />
        )}
        {activeSheet === 'collections' && (
          <CollectionsSheet
            onClose={() => setActiveSheet(null)}
            onSelectRestaurant={(id) => setSelectedRestaurant(id)}
          />
        )}
        {activeSheet === 'categories' && (
          <CategoriesSheet onClose={() => setActiveSheet(null)} activeTypes={activeTypes} setActiveTypes={setActiveTypes} />
        )}

        {/* Full-screen search overlay (in-tree, not a Modal) — picking a result
            opens the detail sheet, same as tapping a pin. */}
        {searchOpen && (
          <MapSearchOverlay
            onClose={() => setSearchOpen(false)}
            onSelectRestaurant={(id) => setSelectedRestaurant(id)}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: spacing.md }}>
        <View style={styles.titleRow}>
          <Text style={[typography.title, { color: colors.text }]}>Explore</Text>
          <Pressable onPress={() => router.push('/settings/location')} style={styles.locChip} hitSlop={8}>
            <Ionicons name="location" size={13} color={colors.accent} />
            <Text style={[styles.locText, { color: colors.textMuted }]} numberOfLines={1}>
              {location.label}
            </Text>
          </Pressable>
        </View>
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <ModeToggle mode={mode} setMode={setMode} />
        </View>
        <Pressable
          onPress={() => router.push('/search')}
          style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <Text style={[styles.searchText, { color: colors.textMuted }]}>
            Search dishes, drinks, places, people
          </Text>
        </Pressable>
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
        renderItem={({ item }) => <PlateTile order={item} width={tileWidth} />}
        ListHeaderComponent={
          <Text style={[styles.count, { color: colors.textMuted }]}>
            {data.length} plates · {filter}
          </Text>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>No plates for this filter yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  seg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill },
  segCompact: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  segText: { fontSize: 14, fontWeight: '800' },
  overlayToggle: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: PADDING,
    marginTop: 14,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchText: { fontSize: 14, fontWeight: '500' },
  count: { fontSize: 13, fontWeight: '600', paddingHorizontal: PADDING, marginBottom: spacing.md },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
  mapTopRow: {
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
  mapSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  mapSearchText: { fontSize: 14, fontWeight: '700' },
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
