import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { RatingBadge } from '@/components/RatingBadge';
import { SectionHeader } from '@/components/SectionHeader';
import type { CuisineFilterValue } from '@/components/CuisineFilterRow';
import { type DiscoverScope, useNearFilter } from '@/hooks/useNearFilter';
import { placeTypeFor } from '@/lib/placeType';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const CARD_WIDTH = 160;
/** How many cards the rail itself shows before "See all" takes over. */
export const ACTIVITY_RAIL_CAP = 12;
/** How far back into recent activity to look before near-filtering — has to
 *  be bigger than the display cap, or a near-but-not-nationally-top-N item
 *  would be filtered out before `isNear` ever saw it. */
const ACTIVITY_POOL = 60;

/**
 * The most recent ratings across the app, pure recency — "what's happening
 * right now" rather than a re-rank of the feed. Deliberately not personalized;
 * cuisine/sort narrowing is what the plate grid below it already does.
 */
export function ActivityRail({
  onPress,
  onSeeAll,
  scope,
  origin,
  cuisine,
}: {
  onPress: (orderId: string) => void;
  onSeeAll: () => void;
  scope: DiscoverScope;
  origin: { lat: number; lng: number } | null;
  cuisine: CuisineFilterValue;
}) {
  const { colors } = useTheme();
  const { recentActivity, userFor, restaurantFor } = useData();
  const isNear = useNearFilter(scope, origin);

  const items = recentActivity(ACTIVITY_POOL).filter((o) => {
    const r = restaurantFor(o.restaurantId);
    if (!isNear(r)) return false;
    if (cuisine === 'overall') return true;
    return !!r && placeTypeFor(r.cuisine) === cuisine;
  });
  if (items.length === 0) return null;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <SectionHeader
        title="Activity"
        subtitle="Just rated"
        actionLabel={items.length > ACTIVITY_RAIL_CAP ? 'See all' : undefined}
        onAction={onSeeAll}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}>
        {items.slice(0, ACTIVITY_RAIL_CAP).map((o) => {
          const user = userFor(o.userId);
          const restaurant = restaurantFor(o.restaurantId);
          return (
            <Pressable
              key={o.id}
              onPress={() => onPress(o.id)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Image source={{ uri: o.photo }} style={styles.image} contentFit="cover" />
              <View style={[styles.ratingWrap]}>
                <RatingBadge score={o.rating} size="sm" />
              </View>
              <View style={styles.body}>
                <View style={styles.byline}>
                  <Avatar uri={user.avatar} size={18} />
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {user.name}
                  </Text>
                </View>
                <Text style={[styles.dish, { color: colors.text }]} numberOfLines={1}>
                  {o.dishName}
                </Text>
                {!!restaurant && (
                  <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
                    {restaurant.name}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
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
  ratingWrap: { position: 'absolute', top: 8, right: 8 },
  body: { padding: 10, gap: 3 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
  dish: { fontSize: 13, fontWeight: '800', marginTop: 1 },
  meta: { fontSize: 11, fontWeight: '500' },
});
