import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { RatingBadge } from '@/components/RatingBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { type DiscoverScope, useNearFilter } from '@/hooks/useNearFilter';
import { formatRelativeDate } from '@/lib/dates';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** How deep into recent activity "See all" looks — a real ceiling, not the pool. */
const ACTIVITY_SEE_ALL_LIMIT = 200;

/** "See all" for Discover's Activity rail — the full nearby-or-global feed of recent ratings. */
export default function DiscoverActivity() {
  const { colors } = useTheme();
  const router = useRouter();
  const { scope, lat, lng } = useLocalSearchParams<{ scope?: string; lat?: string; lng?: string }>();
  const { recentActivity, userFor, restaurantFor } = useData();

  const effectiveScope: DiscoverScope = scope === 'near' ? 'near' : 'global';
  const origin = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
  const isNear = useNearFilter(effectiveScope, origin);

  const items = useMemo(
    () => recentActivity(ACTIVITY_SEE_ALL_LIMIT).filter((o) => isNear(restaurantFor(o.restaurantId))),
    [recentActivity, restaurantFor, isNear],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Activity" />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 4 }} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing rated yet.</Text>
        ) : (
          items.map((o) => {
            const user = userFor(o.userId);
            const restaurant = restaurantFor(o.restaurantId);
            return (
              <Pressable
                key={o.id}
                onPress={() => router.push(`/order/${o.id}`)}
                style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Image source={{ uri: o.photo }} style={styles.img} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <View style={styles.byline}>
                    <Avatar uri={user.avatar} size={20} />
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {user.name}
                    </Text>
                    <Text style={[styles.time, { color: colors.textMuted }]}>{formatRelativeDate(o.createdAt)}</Text>
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
                <RatingBadge score={o.rating} size="sm" />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, fontWeight: '500' },
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
  byline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  time: { fontSize: 11, fontWeight: '500' },
  dish: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  meta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
});
