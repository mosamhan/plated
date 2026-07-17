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

import { FilterChips } from '@/components/FilterChips';
import { PlateTile } from '@/components/PlateTile';
import { PlatosFeed } from '@/components/PlatosFeed';
import { useData } from '@/store/DataContext';
import { useLocation } from '@/store/LocationContext';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

// Kept minimal so the grid stays the focus — the core sort/scope lenses only.
const FILTERS = ['Trending', 'Top Rated', 'Most Reordered', 'Nearby'];

const GAP = spacing.md;
const PADDING = spacing.lg;

type Mode = 'discover' | 'platos';

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
    </View>
  );
}

export default function Explore() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const { exploreOrders } = useData();
  const { location } = useLocation();
  const [filter, setFilter] = useState('Trending');
  const [mode, setMode] = useState<Mode>('discover');

  const data = useMemo(() => exploreOrders(filter), [exploreOrders, filter]);

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
});
