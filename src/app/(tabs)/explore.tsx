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
import { useData } from '@/store/DataContext';
import { spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const FILTERS = [
  'Trending',
  'Top Rated',
  'Most Reordered',
  'Nearby',
  'Burgers',
  'Ramen',
  'Italian',
  'Mexican',
  'BBQ',
  'Brunch',
  'South Indian',
  'Japanese',
];

const GAP = spacing.md;
const PADDING = spacing.lg;

export default function Explore() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const { exploreOrders } = useData();
  const [filter, setFilter] = useState('Trending');

  const data = useMemo(() => exploreOrders(filter), [exploreOrders, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <Text style={[typography.title, { color: colors.text, paddingHorizontal: PADDING }]}>
          Explore
        </Text>
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
