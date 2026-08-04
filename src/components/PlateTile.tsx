import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { RatingBadge } from '@/components/RatingBadge';
import { foodPlaceholder } from '@/data/images';
import { Order } from '@/data/types';
import { useData } from '@/store/DataContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  order: Order;
  width?: number;
  /** Overrides opening the post — Explore uses it to drive the map instead. */
  onPress?: () => void;
  /** Draws the tile as the one currently pinned on the map. */
  selected?: boolean;
}

export function PlateTile({ order, width, onPress, selected }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userFor, restaurantFor } = useData();
  const restaurant = restaurantFor(order.restaurantId);
  const user = userFor(order.userId);

  return (
    <AnimatedPressable
      onPress={onPress ?? (() => router.push(`/order/${order.id}`))}
      style={[
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.border, width },
        selected && { borderColor: colors.accent, borderWidth: 1.5 },
      ]}>
      <View>
        <Image
          source={{ uri: order.photo }}
          placeholder={foodPlaceholder(order.id)}
          placeholderContentFit="cover"
          transition={{ duration: 250, effect: 'cross-dissolve', timing: 'ease-out' }}
          recyclingKey={order.id}
          cachePolicy="memory-disk"
          style={[styles.photo, { backgroundColor: colors.surface }]}
          contentFit="cover"
        />
        <View style={styles.badge}>
          <RatingBadge score={order.rating} size="sm" />
        </View>
        {/* Only the author ever has an archived post in state; badge it so the
            grid shows it's hidden from everyone else. */}
        {order.archived && (
          <View style={styles.archived}>
            <Ionicons name="archive" size={9} color="#fff" />
            <Text style={styles.archivedText}>Archived</Text>
          </View>
        )}
        {/* FTC: disclosure must appear where the endorsement appears, not one tap later */}
        {user.compensationEligible && (
          <View style={styles.commission}>
            <Ionicons name="cash-outline" size={9} color="#FFFFFF" />
            <Text style={styles.commissionText}>Earns commission</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.dish, { color: colors.text }]} numberOfLines={1}>
          {order.dishName}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {restaurant?.name} · @{user.handle}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  photo: { width: '100%', aspectRatio: 1 },
  badge: { position: 'absolute', right: 8, bottom: 8 },
  commission: {
    position: 'absolute',
    left: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  commissionText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  archived: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  archivedText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  body: { padding: 10 },
  dish: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  meta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
