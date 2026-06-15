import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FloatingAddButton } from '@/components/FloatingAddButton';
import { RatingBadge } from '@/components/RatingBadge';
import { TextField } from '@/components/TextField';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function Search() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { searchRestaurants, restaurantWithRating } = useData();
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchRestaurants(query), [searchRestaurants, query]);
  const topMatch = query.trim() && results.length > 0 ? results[0] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ paddingRight: 4 }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <TextField
            icon="search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search restaurants & cuisines"
            autoFocus
            style={{ paddingVertical: 8 }}
          />
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
        ListHeaderComponent={
          <Text style={[styles.count, { color: colors.textMuted }]}>
            {results.length} {results.length === 1 ? 'restaurant' : 'restaurants'}
          </Text>
        }
        renderItem={({ item }) => {
          const withRating = restaurantWithRating(item.id);
          return (
            <Pressable
              onPress={() => router.push(`/restaurant/${item.id}`)}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image
                source={{ uri: item.image }}
                style={[styles.img, { backgroundColor: colors.surface }]}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                  {item.cuisine} · {item.priceLevel} · {item.distance}
                </Text>
              </View>
              {withRating && withRating.orderCount > 0 && (
                <RatingBadge score={withRating.platedRating} size="sm" />
              )}
            </Pressable>
          );
        }}
      />

      <FloatingAddButton
        label={topMatch ? `Add plate at ${topMatch.name}` : 'Add a plate'}
        onPress={() =>
          router.push(topMatch ? `/create?restaurantId=${topMatch.id}` : '/create')
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 4,
  },
  count: { fontSize: 13, fontWeight: '600', marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  img: { width: 54, height: 54, borderRadius: radius.md },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13, fontWeight: '500', marginTop: 2 },
});
