import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { RatingBadge } from '@/components/RatingBadge';
import { dishKey, summarizeDishes } from '@/lib/dishes';
import { useData } from '@/store/DataContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A restaurant's full menu: one row per dish, ranked by average rating, each
 * expandable to the individual ratings behind that average (best first).
 *
 * Rendered inside the restaurant sheet rather than as its own route, because a
 * route would sit *under* the sheet's Modal and couldn't return to the card.
 * It scrolls within whatever list its parent provides, so it can grow.
 */
export function MenuPanel({
  restaurantId,
  onOpenOrder,
}: {
  restaurantId: string;
  onOpenOrder: (orderId: string) => void;
}) {
  const { colors } = useTheme();
  const { ordersByRestaurant, userFor } = useData();
  const orders = ordersByRestaurant(restaurantId);
  const dishes = useMemo(() => summarizeDishes(orders), [orders]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const platesFor = (name: string) =>
    orders.filter((o) => dishKey(o.dishName) === dishKey(name)).sort((a, b) => b.rating - a.rating);

  if (dishes.length === 0) {
    return (
      <Text style={[styles.empty, { color: colors.textMuted }]}>Nobody has rated a plate here yet.</Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {dishes.map((d) => {
        const expanded = open.has(d.dishName);
        return (
          <View key={d.dishName} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable onPress={() => toggle(d.dishName)} style={styles.dishRow}>
              <Image source={{ uri: d.photo }} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.dishName, { color: colors.text }]} numberOfLines={1}>
                  {d.dishName}
                </Text>
                <Text style={[styles.dishMeta, { color: colors.textMuted }]}>
                  {d.count === 1 ? '1 rating' : `${d.count} ratings`}
                </Text>
              </View>
              <RatingBadge score={d.rating} size="sm" />
              {d.count > 1 && (
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                  style={{ marginLeft: 4 }}
                />
              )}
            </Pressable>

            {expanded && (
              <View style={[styles.plates, { borderTopColor: colors.border }]}>
                {platesFor(d.dishName).map((o) => {
                  const u = userFor(o.userId);
                  return (
                    <Pressable key={o.id} onPress={() => onOpenOrder(o.id)} style={styles.plateRow}>
                      <Avatar uri={u.avatar} size={30} verified={u.verified} />
                      <Text style={[styles.plateWho, { color: colors.text }]} numberOfLines={1}>
                        {u.name}
                      </Text>
                      <RatingBadge score={o.rating} size="sm" />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 20 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  dishRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.06)' },
  dishName: { fontSize: 15, fontWeight: '800' },
  dishMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  plates: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingBottom: 4 },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  plateWho: { flex: 1, fontSize: 14, fontWeight: '600' },
});
