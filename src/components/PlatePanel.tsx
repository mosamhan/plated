import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { RatingBadge } from '@/components/RatingBadge';
import { Order } from '@/data/types';
import { collabLabel } from '@/lib/collabs';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  order: Order;
  /** Opens the full post screen. */
  onOpen: () => void;
  onOrder: () => void;
}

/**
 * The plate side of the map sheet: enough of the post to decide on it — photo,
 * score, who rated it and what they said — without leaving the map. The full
 * post is one tap away for comments and the rest.
 */
export function PlatePanel({ order, onOpen, onOrder }: Props) {
  const { colors } = useTheme();
  const { userFor } = useData();
  const user = userFor(order.userId);
  const collabs = collabLabel(order.collaborators, (id) => userFor(id).handle);

  return (
    <View>
      <Pressable onPress={onOpen} style={styles.photoWrap}>
        <Image source={{ uri: order.photo }} style={styles.photo} contentFit="cover" transition={150} />
        <View style={styles.badge}>
          <RatingBadge score={order.rating} size="lg" />
        </View>
      </Pressable>

      <View style={styles.head}>
        <Text style={[styles.dish, { color: colors.text }]} numberOfLines={2}>
          {order.dishName}
        </Text>
        {(order.reorders ?? 0) > 0 && (
          <View style={styles.reorderRow}>
            <Ionicons name="repeat" size={13} color={colors.success} />
            <Text style={[styles.reorderText, { color: colors.success }]}>
              {order.reorders} reordered this plate
            </Text>
          </View>
        )}
      </View>

      <Pressable onPress={onOpen} style={[styles.creator, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Avatar uri={user.avatar} size={38} verified={user.verified} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.creatorName, { color: colors.text }]} numberOfLines={1}>
            {user.name}
            {collabs ? ` · with ${collabs}` : ''}
          </Text>
          <Text style={[styles.creatorMeta, { color: colors.textMuted }]} numberOfLines={1}>
            @{user.handle}
            {user.compensationEligible ? ' · earns commission' : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>

      {order.description ? (
        <Text style={[styles.notes, { color: colors.textMuted }]} numberOfLines={4}>
          {order.description}
        </Text>
      ) : null}

      {/* Every item on the order, best first — the multi-item posts show here too. */}
      {order.items && order.items.length > 1 && (
        <View style={[styles.items, { borderColor: colors.border }]}>
          {order.items.map((it) => (
            <View key={it.name} style={styles.itemRow}>
              <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                {it.name}
              </Text>
              <RatingBadge score={it.rating} size="sm" />
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={onOrder} style={[styles.cta, { backgroundColor: colors.orderCta }]}>
        <Ionicons name="bag-handle" size={17} color={colors.orderCtaText} />
        <Text style={[styles.ctaText, { color: colors.orderCtaText }]}>Order this plate</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  photoWrap: { borderRadius: radius.lg, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  badge: { position: 'absolute', right: 10, bottom: 10 },
  head: { marginTop: spacing.md, gap: 4 },
  dish: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reorderText: { fontSize: 12, fontWeight: '700' },
  creator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.md,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  creatorName: { fontSize: 14, fontWeight: '800' },
  creatorMeta: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  notes: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginTop: spacing.md },
  items: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10 },
  itemName: { fontSize: 14, fontWeight: '600', flex: 1 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.lg,
    height: 50,
    borderRadius: radius.lg,
  },
  ctaText: { fontSize: 15, fontWeight: '800' },
  listHead: { fontSize: 13, fontWeight: '700' },
  none: { fontSize: 14, fontWeight: '500', textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowPhoto: { width: 54, height: 54, borderRadius: radius.md },
  rowDish: { fontSize: 15, fontWeight: '800' },
  rowBy: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});

/**
 * Every plate rated at a place, best first — what the plate side shows when you
 * arrived from a pin and haven't picked a dish yet. Tapping one opens the full
 * post, since that's where comments and ordering live.
 */
export function PlateList({ orders, onOpen }: { orders: Order[]; onOpen: (orderId: string) => void }) {
  const { colors } = useTheme();
  const { userFor } = useData();
  const ranked = [...orders].sort((a, b) => b.rating - a.rating);

  if (ranked.length === 0) {
    return (
      <Text style={[styles.none, { color: colors.textMuted }]}>
        Nobody has rated a plate here yet — be the first.
      </Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.listHead, { color: colors.textMuted }]}>
        {ranked.length} {ranked.length === 1 ? 'plate' : 'plates'} rated here
      </Text>
      {ranked.map((o) => {
        const by = userFor(o.userId);
        return (
          <Pressable
            key={o.id}
            onPress={() => onOpen(o.id)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
            ]}>
            <Image source={{ uri: o.photo }} style={styles.rowPhoto} contentFit="cover" transition={120} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowDish, { color: colors.text }]} numberOfLines={1}>
                {o.dishName}
              </Text>
              <Text style={[styles.rowBy, { color: colors.textMuted }]} numberOfLines={1}>
                {by.name}
                {(o.reorders ?? 0) > 0 ? ` · ${o.reorders} reordered` : ''}
              </Text>
            </View>
            <RatingBadge score={o.rating} size="sm" />
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}
