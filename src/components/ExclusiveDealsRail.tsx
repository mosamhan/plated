import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SectionHeader } from '@/components/SectionHeader';
import { RestaurantOffer } from '@/data/types';
import type { CuisineFilterValue } from '@/components/CuisineFilterRow';
import { type DiscoverScope, useNearFilter } from '@/hooks/useNearFilter';
import { placeTypeFor } from '@/lib/placeType';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const CARD_WIDTH = 200;
/** How many cards the rail itself shows before "See all" takes over. */
export const DEALS_RAIL_CAP = 8;

/**
 * Live restaurant offers, nearby-first — a delivery-app-style "deals" rail.
 * Tapping a card opens the restaurant sheet, where OfferBannerList already
 * handles redeem/copy, so this rail only needs to be an entry point.
 */
export function ExclusiveDealsRail({
  onPress,
  onSeeAll,
  scope,
  origin,
  cuisine,
}: {
  onPress: (restaurantId: string) => void;
  onSeeAll: () => void;
  scope: DiscoverScope;
  origin: { lat: number; lng: number } | null;
  cuisine: CuisineFilterValue;
}) {
  const { colors } = useTheme();
  const { activeOffers, restaurantFor } = useData();
  const isNear = useNearFilter(scope, origin);

  const items = activeOffers()
    .map((offer) => ({ offer, restaurant: restaurantFor(offer.restaurantId) }))
    .filter((x): x is { offer: RestaurantOffer; restaurant: NonNullable<ReturnType<typeof restaurantFor>> } => !!x.restaurant)
    .filter(({ restaurant }) => isNear(restaurant))
    .filter(({ restaurant }) => cuisine === 'overall' || placeTypeFor(restaurant.cuisine) === cuisine);

  if (items.length === 0) return null;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <SectionHeader
        title="Exclusive Deals"
        subtitle="Redeem in the app"
        actionLabel={items.length > DEALS_RAIL_CAP ? 'See all' : undefined}
        onAction={onSeeAll}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}>
        {items.slice(0, DEALS_RAIL_CAP).map(({ offer, restaurant }) => (
          <Pressable
            key={offer.id}
            onPress={() => onPress(restaurant.id)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Image source={{ uri: restaurant.image }} style={styles.image} contentFit="cover" />
            <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="pricetag" size={11} color={colors.accent} />
              <Text style={[styles.badgeText, { color: colors.accent }]}>
                {offer.offerType === 'plated_exclusive' ? 'Plated exclusive' : 'Promo code'}
              </Text>
            </View>
            <View style={styles.body}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {offer.title}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                {restaurant.name}
              </Text>
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
  image: { width: '100%', height: 90 },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  body: { padding: 10, gap: 2 },
  title: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
  meta: { fontSize: 11, fontWeight: '500' },
});
