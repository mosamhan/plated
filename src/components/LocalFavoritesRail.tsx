import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CuisineFilterValue } from '@/components/CuisineFilterRow';
import { SectionHeader } from '@/components/SectionHeader';
import { Restaurant, SponsoredPlacement } from '@/data/types';
import { type DiscoverScope, useNearFilter } from '@/hooks/useNearFilter';
import { placeTypeFor } from '@/lib/placeType';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const CARD_WIDTH = 200;

/**
 * The early-stage "Local Favorites" flat-fee tier: a rail of restaurants
 * paying a flat monthly subscription for placement, ahead of the organic
 * grid. See 0028_restaurant_subscriptions.sql. Renders nothing when no
 * restaurant has an active `local_favorite` placement, rather than an empty
 * section.
 */
export function LocalFavoritesRail({
  onPress,
  scope,
  origin,
  cuisine,
}: {
  onPress: (restaurantId: string) => void;
  scope: DiscoverScope;
  origin: { lat: number; lng: number } | null;
  cuisine: CuisineFilterValue;
}) {
  const { colors } = useTheme();
  const { placementsFor, restaurantFor } = useData();
  const isNear = useNearFilter(scope, origin);

  const items = placementsFor('local_favorite')
    .map((placement) => ({ placement, restaurant: restaurantFor(placement.restaurantId) }))
    .filter((x): x is { placement: SponsoredPlacement; restaurant: Restaurant } => !!x.restaurant)
    .filter(({ restaurant }) => isNear(restaurant))
    .filter(({ restaurant }) => cuisine === 'overall' || placeTypeFor(restaurant.cuisine) === cuisine);

  if (items.length === 0) return null;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <SectionHeader title="Local Favorites" subtitle="Sponsored" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}>
        {items.map(({ placement, restaurant }) => (
          <Pressable
            key={placement.id}
            onPress={() => onPress(restaurant.id)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Image source={{ uri: restaurant.image }} style={styles.image} contentFit="cover" />
            <View style={styles.body}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {restaurant.name}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                {restaurant.cuisine} · {restaurant.location}
              </Text>
              {!!placement.headline && (
                <Text style={[styles.headline, { color: colors.accent }]} numberOfLines={2}>
                  {placement.headline}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  image: { width: '100%', height: 110 },
  body: { padding: 10, gap: 2 },
  name: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 11, fontWeight: '500' },
  headline: { fontSize: 12, fontWeight: '700', marginTop: 4, lineHeight: 16 },
});
