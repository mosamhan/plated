import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CuisineFilterRow, type CuisineFilterValue } from '@/components/CuisineFilterRow';
import { PLACE_TYPE_META } from '@/components/ExploreMap';
import { RankRow } from '@/components/RankRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { tapLight } from '@/lib/haptics';
import { placeTypeFor, type PlaceType } from '@/lib/placeType';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

type Kind = 'restaurants' | 'plates';
type Filter = CuisineFilterValue;

/**
 * A user's own rankings — every plate they've personally rated, and every
 * restaurant that adds up to ("visited places"). No new data: rating a plate
 * already *is* the record of a visit here, so this is just `myPlateRankings`/
 * `myRestaurantRankings` (DataContext) through the exact filter-chip pattern
 * RanksView uses, minus the near/global scope (this is always "everywhere
 * you've been", not a location-scoped leaderboard).
 */
export default function MyRankingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { myRestaurantRankings, myPlateRankings } = useData();
  const [kind, setKind] = useState<Kind>('restaurants');
  const [filter, setFilter] = useState<Filter>('overall');

  const cuisine: PlaceType | null = filter === 'overall' ? null : filter;

  const restaurants = useMemo(
    () => myRestaurantRankings().filter((r) => cuisine == null || placeTypeFor(r.cuisine) === cuisine),
    [myRestaurantRankings, cuisine],
  );
  const plates = useMemo(
    () =>
      myPlateRankings().filter((o) => {
        if (cuisine == null) return true;
        // `restaurants` is already filtered to this cuisine when set, so a
        // plate's restaurant matching the filter is exactly "found in it".
        return restaurants.some((r) => r.id === o.restaurantId);
      }),
    [myPlateRankings, restaurants, cuisine],
  );

  const showingPlates = kind === 'plates';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="My rankings" />

      <View style={styles.kindRow}>
        {(['restaurants', 'plates'] as Kind[]).map((k) => {
          const on = kind === k;
          return (
            <Pressable
              key={k}
              onPress={() => {
                tapLight();
                setKind(k);
              }}
              style={[
                styles.kindChip,
                { backgroundColor: on ? colors.accent : colors.surface, borderColor: on ? colors.accent : colors.border },
              ]}>
              <Text style={[styles.kindText, { color: on ? colors.accentText : colors.text }]}>
                {k === 'restaurants' ? 'Places' : 'Plates'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CuisineFilterRow value={filter} onChange={setFilter} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingTop: 10, paddingBottom: 60 }}>
        {showingPlates ? (
          plates.length ? (
            plates.map((o, i) => (
              <RankRow
                key={o.id}
                rank={i + 1}
                image={o.photo}
                title={o.dishName}
                subtitle={restaurants.find((r) => r.id === o.restaurantId)?.name ?? ''}
                score={o.rating}
                onPress={() => router.push(`/order/${o.id}`)}
              />
            ))
          ) : (
            <Empty text={cuisine ? `No rated ${PLACE_TYPE_META[cuisine].label.toLowerCase()} plates yet.` : 'Rate a plate to see it here.'} />
          )
        ) : restaurants.length ? (
          restaurants.map((r, i) => (
            <RankRow
              key={r.id}
              rank={i + 1}
              image={r.image}
              title={r.name}
              subtitle={`${r.cuisine} · ${r.orderCount} ${r.orderCount === 1 ? 'item' : 'items'} rated`}
              score={r.platedRating}
              onPress={() => router.push(`/restaurant/${r.id}`)}
            />
          ))
        ) : (
          <Empty text={cuisine ? `No rated ${PLACE_TYPE_META[cuisine].label.toLowerCase()} yet.` : 'Rate a plate to see places you’ve been.'} />
        )}
      </ScrollView>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 30, fontSize: 14, fontWeight: '500' }}>{text}</Text>;
}

const styles = StyleSheet.create({
  kindRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingTop: 10 },
  kindChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  kindText: { fontSize: 14, fontWeight: '800' },
});
