import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FloatingAddButton } from '@/components/FloatingAddButton';
import { PlateTile } from '@/components/PlateTile';
import { ScreenHeader } from '@/components/ScreenHeader';
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
  const { restaurantWithRating, ordersByRestaurant } = useData();

  const restaurant = restaurantWithRating(id);
  const orders = ordersByRestaurant(id);

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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
