import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { RatingBadge } from '@/components/RatingBadge';
import { dishKey, mergeMenu, summarizeDishes, type MenuRow } from '@/lib/dishes';
import { fetchMenuItems } from '@/lib/places';
import { useData } from '@/store/DataContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A restaurant's menu — Foursquare's structured menu first, with Plated's
 * crowd ratings overlaid on the dishes people have actually rated.
 *
 * Why not crowd-only: a fresh restaurant nobody's rated would show an empty
 * menu. Pulling FSQ's dish list means the menu is populated from day one; the
 * ratings then fill in as people post. FSQ's menu field is premium and empty
 * for most places, so when it returns nothing this gracefully falls back to
 * exactly the crowd-sourced menu it showed before.
 *
 * Rated dishes rank first (by average, then how many rated it); unrated
 * API-only items follow in menu order, tagged "Not rated yet". A rated dish
 * expands to the individual ratings behind its average (best first).
 */
export function MenuPanel({
  restaurantId,
  onOpenOrder,
}: {
  restaurantId: string;
  onOpenOrder: (orderId: string) => void;
}) {
  const { colors } = useTheme();
  const { ordersByRestaurant, userFor, restaurantFor } = useData();
  const orders = ordersByRestaurant(restaurantId);
  const restaurant = restaurantFor(restaurantId);
  const crowd = useMemo(() => summarizeDishes(orders), [orders]);

  // Foursquare's structured menu (names only). Empty on the common no-menu /
  // no-credits case, which just leaves the crowd menu standing.
  const [apiMenu, setApiMenu] = useState<string[]>([]);
  const [loadingApi, setLoadingApi] = useState(!!restaurant?.fsqId);
  useEffect(() => {
    let alive = true;
    if (!restaurant?.fsqId) {
      setLoadingApi(false);
      return;
    }
    setLoadingApi(true);
    fetchMenuItems(restaurant.fsqId)
      .then((items) => alive && setApiMenu(items))
      .finally(() => alive && setLoadingApi(false));
    return () => {
      alive = false;
    };
  }, [restaurant?.fsqId]);

  // Foursquare menu first, crowd ratings overlaid — see mergeMenu.
  const rows: MenuRow[] = useMemo(() => mergeMenu(crowd, apiMenu), [crowd, apiMenu]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const platesFor = (name: string) =>
    orders.filter((o) => dishKey(o.dishName) === dishKey(name)).sort((a, b) => b.rating - a.rating);

  if (rows.length === 0) {
    return loadingApi ? (
      <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
    ) : (
      <Text style={[styles.empty, { color: colors.textMuted }]}>
        No menu yet — be the first to rate a plate here.
      </Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {rows.map((d) => {
        const expandable = d.rated && d.count > 1;
        const expanded = expandable && open.has(d.dishName);
        return (
          <View key={d.dishName} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              onPress={() => expandable && toggle(d.dishName)}
              disabled={!expandable}
              style={styles.dishRow}>
              {d.rated ? (
                <Image source={{ uri: d.photo }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty, { borderColor: colors.border }]}>
                  <Ionicons name="restaurant-outline" size={18} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.dishName, { color: colors.text }]} numberOfLines={1}>
                  {d.dishName}
                </Text>
                <Text style={[styles.dishMeta, { color: colors.textMuted }]}>
                  {d.rated ? (d.count === 1 ? '1 rating' : `${d.count} ratings`) : 'Not rated yet'}
                </Text>
              </View>
              {d.rated ? (
                <RatingBadge score={d.rating} size="sm" />
              ) : (
                <Ionicons name="ellipse-outline" size={18} color={colors.border} />
              )}
              {expandable && (
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
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  dishName: { fontSize: 15, fontWeight: '800' },
  dishMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  plates: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingBottom: 4 },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  plateWho: { flex: 1, fontSize: 14, fontWeight: '600' },
});
