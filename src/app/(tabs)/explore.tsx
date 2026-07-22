import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExploreMap, deriveCategory, type MapRestaurant, type PinCategory } from '@/components/ExploreMap';
import { FilterChips } from '@/components/FilterChips';
import { CategoriesSheet, CollectionsSheet, MapSettingsSheet } from '@/components/MapSheets';
import { PlateTile } from '@/components/PlateTile';
import { PlatosFeed } from '@/components/PlatosFeed';
import { RestaurantDetailSheet } from '@/components/RestaurantDetailSheet';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';
import type { Region } from 'react-native-maps';

// Kept minimal so the grid stays the focus — the core sort/scope lenses only.
const FILTERS = ['Trending', 'Top Rated', 'Most Reordered', 'Nearby'];

const GAP = spacing.md;
const PADDING = spacing.lg;

type Mode = 'platos' | 'discover' | 'map';

function ModeToggle({ mode, setMode, overlay }: { mode: Mode; setMode: (m: Mode) => void; overlay?: boolean }) {
  const { colors } = useTheme();
  const bg = overlay ? 'rgba(20,20,20,0.55)' : colors.surface;
  const seg = (m: Mode, icon: keyof typeof Ionicons.glyphMap, label: string) => {
    const on = mode === m;
    const inactive = overlay ? 'rgba(255,255,255,0.8)' : colors.textMuted;
    return (
      <Pressable
        onPress={() => setMode(m)}
        style={[styles.seg, on && { backgroundColor: colors.accent }]}>
        <Ionicons name={icon} size={15} color={on ? colors.accentText : inactive} />
        <Text style={[styles.segText, { color: on ? colors.accentText : inactive }]}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.toggle, { backgroundColor: bg }]}>
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
  const { exploreOrders, topRestaurants, ordersByRestaurant } = useData();
  const { location } = useLocation();
  const { isSaved } = useCollections();
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
  const mapTheme: 'light' | 'dark' = mapThemeOverride ?? (colors.isDark ? 'dark' : 'light');

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
          restaurants={visiblePins}
          region={region}
          mapTheme={mapTheme}
          onSelect={(r) => setSelectedRestaurant(r.id)}
        />

        {/* Top row: settings gear · mode toggle · collections bookmark */}
        <View style={[styles.mapTopRow, { top: insets.top + 14 }]}>
          <Pressable
            onPress={() => setActiveSheet('settings')}
            style={[styles.mapCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="options-outline" size={20} color={colors.text} />
          </Pressable>
          <ModeToggle mode={mode} setMode={setMode} overlay />
          <Pressable
            onPress={() => setActiveSheet('collections')}
            style={[styles.mapCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="bookmark-outline" size={19} color={colors.text} />
          </Pressable>
        </View>

        {/* Bottom row: search · categories · My Table · Platers.
            Hidden while the restaurant overlay is open (design §2). */}
        {!selectedRestaurant && (
          <View style={[styles.mapBottomRow, { bottom: insets.bottom + 90 }]}>
            <Pressable
              onPress={() => router.push('/search')}
              style={[styles.mapCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={19} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => setActiveSheet('categories')}
              style={[styles.mapCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="options" size={19} color={colors.text} />
            </Pressable>
            <MapPill label="My Table" icon="bookmark" active={myTableOnly} onPress={() => setMyTableOnly(true)} />
            <MapPill label="Platers" icon="earth" active={!myTableOnly} onPress={() => setMyTableOnly(false)} />
          </View>
        )}

        <RestaurantDetailSheet
          restaurantId={selectedRestaurant}
          onClose={() => setSelectedRestaurant(null)}
          avoidTolls={avoidTolls}
        />

        {activeSheet === 'settings' && (
          <MapSettingsSheet
            onClose={() => setActiveSheet(null)}
            mapTheme={mapTheme}
            setMapTheme={setMapThemeOverride}
            avoidTolls={avoidTolls}
            setAvoidTolls={setAvoidTolls}
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
            Search dishes, restaurants, people
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

function MapPill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.mapPill,
        { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.accent : colors.border },
      ]}>
      <Ionicons name={icon} size={14} color={active ? colors.accentText : colors.textMuted} />
      <Text style={{ color: active ? colors.accentText : colors.textMuted, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </Pressable>
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
  mapBottomRow: {
    position: 'absolute',
    left: PADDING,
    right: PADDING,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  mapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
