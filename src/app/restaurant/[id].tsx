import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FloatingAddButton } from '@/components/FloatingAddButton';
import { PlateTile } from '@/components/PlateTile';
import { RatingBadge } from '@/components/RatingBadge';
import { ScreenHeader } from '@/components/ScreenHeader';
import { openDirections, openReservation } from '@/lib/external';
import { useData } from '@/store/DataContext';
import { radius, ratingColor, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const PADDING = spacing.lg;
const GAP = spacing.md;

export default function RestaurantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = (windowWidth - PADDING * 2 - GAP) / 2;
  const { restaurantWithRating, ordersByRestaurant, restaurantMenu } = useData();

  const restaurant = restaurantWithRating(id);
  const orders = ordersByRestaurant(id);
  const menu = restaurantMenu(id);

  if (!restaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Restaurant" />
      </View>
    );
  }

  const scoreColor = ratingColor(colors, restaurant.platedRating);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.headerOverlay}>
        <ScreenHeader transparent rightIcon="share-outline" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Image
          source={{ uri: restaurant.image }}
          style={[styles.hero, { backgroundColor: colors.surface }]}
          contentFit="cover"
          transition={200}
        />

        <View style={styles.body}>
          <Text style={[typography.title, { color: colors.text }]}>{restaurant.name}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {restaurant.cuisine} · {restaurant.priceLevel}
            </Text>
            <View style={[styles.dotSep, { backgroundColor: colors.textMuted }]} />
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {restaurant.location} · {restaurant.distance}
            </Text>
          </View>

          {/* Plated's Rating */}
          <View style={[styles.ratingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.scoreBox, { backgroundColor: scoreColor }]}>
              <Text style={styles.scoreText}>{restaurant.platedRating.toFixed(1)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ratingTitle, { color: colors.text }]}>Plated&apos;s Rating</Text>
              <Text style={[styles.ratingSub, { color: colors.textMuted }]}>
                Average of {restaurant.orderCount} community-rated plates — not a vibe score, a plate
                score.
              </Text>
            </View>
          </View>

          {/* Directions + reservations */}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => openDirections('google', restaurant)}
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="navigate" size={17} color={colors.accent} />
              <Text style={[styles.actionText, { color: colors.text }]}>Directions</Text>
            </Pressable>
            <Pressable
              onPress={() => openReservation('opentable', restaurant)}
              style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="calendar" size={16} color={colors.accent} />
              <Text style={[styles.actionText, { color: colors.text }]}>Reserve</Text>
            </Pressable>
          </View>

          <Text style={[typography.heading, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md }]}>
            Plates here
          </Text>
          <View style={styles.grid}>
            {orders.map((o) => (
              <PlateTile key={o.id} order={o} width={tileWidth} />
            ))}
            {orders.length === 0 && (
              <Text style={{ color: colors.textMuted }}>Be the first to rate a plate here.</Text>
            )}
          </View>

          {/* Menu — every dish rated here + its community score. */}
          {menu.length > 0 && (
            <>
              <Text style={[typography.heading, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.md }]}>
                Menu
              </Text>
              <View>
                {menu.map((m) => (
                  <View key={m.name} style={[styles.menuRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.menuName, { color: colors.text }]} numberOfLines={1}>{m.name}</Text>
                      <Text style={[styles.menuMeta, { color: colors.textMuted }]}>
                        {m.count} {m.count === 1 ? 'rating' : 'ratings'}
                      </Text>
                    </View>
                    <RatingBadge score={m.rating} size="sm" />
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <FloatingAddButton label="Add a plate" onPress={() => router.push(`/create?restaurantId=${restaurant.id}`)} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  hero: { width: '100%', height: 220 },
  body: { padding: PADDING },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  meta: { fontSize: 13, fontWeight: '600' },
  dotSep: { width: 3, height: 3, borderRadius: 2 },
  ratingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
  },
  scoreBox: { width: 64, height: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  scoreText: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  ratingTitle: { fontSize: 17, fontWeight: '800' },
  ratingSub: { fontSize: 13, fontWeight: '500', marginTop: 3, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 14, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuName: { fontSize: 15, fontWeight: '700' },
  menuMeta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
});
