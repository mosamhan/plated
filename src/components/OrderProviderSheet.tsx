import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RatingBadge } from '@/components/RatingBadge';
import { Order } from '@/data/types';
import { openReservation } from '@/lib/external';
import { tapMedium } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The plate being ordered — hand-off records an attributed order on it (optional for video/Platos). */
  order?: Order;
  restaurantName: string;
  dishName: string;
  /** For the reservation-search term. */
  restaurantLocation?: string;
  /**
   * When set, the sheet shows a select/deselect list of these plates and the
   * order query is built from the ticked ones — like the plate-post order flow.
   */
  plates?: { dishName: string; rating: number }[];
  /**
   * Drives the order-vs-reserve heuristic: `$$$` (fine dining) leads with
   * Reserve and recommends a service; `$` / `$$` lead with delivery/pickup.
   * Both sections still show, so it's never a dead end.
   */
  priceLevel?: '$' | '$$' | '$$$';
  /** Handle of the person whose plate this is. */
  creatorHandle?: string;
  /** Whether ordering this plate pays commission to the creator. */
  supportsCreator?: boolean;
}

interface Reservation {
  key: 'opentable' | 'resy' | 'search';
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  recommended?: boolean;
}

// OpenTable leads as the broadest default; Resy and a general search follow.
const RESERVATIONS: Reservation[] = [
  { key: 'opentable', label: 'OpenTable', sub: 'Recommended · book a table', icon: 'restaurant', color: '#DA3743', recommended: true },
  { key: 'resy', label: 'Resy', sub: 'Book on Resy', icon: 'wine', color: '#C6362E' },
  { key: 'search', label: 'Find a reservation', sub: 'Resy, Tock & more', icon: 'search', color: '#6B7280' },
];

interface Provider {
  key: string;
  label: string;
  sub: string;
  action: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  url: (q: string) => string;
}

const PROVIDERS: Provider[] = [
  {
    key: 'doordash',
    label: 'DoorDash',
    sub: 'Delivery • ~25–40 min',
    action: 'Opens DoorDash',
    icon: 'bicycle',
    color: '#FF3008',
    url: (q) => `https://www.doordash.com/search/store/${q}`,
  },
  {
    key: 'ubereats',
    label: 'Uber Eats',
    sub: 'Delivery • ~20–35 min',
    action: 'Opens Uber Eats',
    icon: 'car',
    color: '#06C167',
    url: (q) => `https://www.ubereats.com/search?q=${q}`,
  },
  {
    key: 'pickup',
    label: 'Pickup',
    sub: 'Order ahead & grab it',
    action: 'Opens in browser',
    icon: 'bag-handle',
    color: '#3B82F6',
    url: (q) => `https://www.google.com/search?q=${q}+order+pickup`,
  },
];

export function OrderProviderSheet({
  visible,
  onClose,
  order,
  restaurantName,
  dishName,
  restaurantLocation,
  plates,
  priceLevel,
  creatorHandle,
  supportsCreator,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { markReordered } = useData();

  // Plate selection (when a plate list is supplied). All ticked by default —
  // ordering the whole spread is the common case, same as the plate-post flow.
  const hasPlateList = !!plates && plates.length > 0;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (visible && plates) setSelected(new Set(plates.map((_, i) => i)));
  }, [visible, plates]);
  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  const selectedDishes = plates?.filter((_, i) => selected.has(i)).map((p) => p.dishName) ?? [];

  // Fine dining leads with Reserve; everywhere else leads with delivery/pickup.
  const reserveFirst = priceLevel === '$$$';

  // Query the provider searches for: the selected dishes narrow it when we have
  // a plate list, else the passed dishName.
  const orderQuery = hasPlateList ? [restaurantName, ...selectedDishes].join(' ') : `${dishName} ${restaurantName}`;
  const canOrder = !hasPlateList || selected.size > 0;

  const handlePick = (p: Provider) => {
    tapMedium();
    // Mock attribution: production appends subId1=creatorId, subId2=plateId,
    // subId3=sessionId for affiliate-network tracking.
    if (order) markReordered(order.id);
    Linking.openURL(p.url(encodeURIComponent(orderQuery))).catch(() => {});
    onClose();
  };

  const handleReserve = (r: Reservation) => {
    tapMedium();
    openReservation(r.key, { name: restaurantName, location: restaurantLocation });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {/* Scrolls because reserve + delivery + a plate list can run taller
              than the screen; the grabber above stays fixed. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 16 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            {reserveFirst ? 'Reserve or order' : 'Order this exact plate'}
          </Text>
          <Text style={[styles.dish, { color: colors.textMuted }]} numberOfLines={1}>
            {restaurantName}
          </Text>

          {/* Plate select/deselect — pick what to order. */}
          {hasPlateList && (
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              {plates!.map((p, i) => {
                const on = selected.has(i);
                return (
                  <Pressable
                    key={i}
                    onPress={() => toggle(i)}
                    style={[styles.plateRow, { borderColor: colors.border }]}>
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={on ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.plateName, { color: colors.text }]} numberOfLines={1}>
                      {p.dishName}
                    </Text>
                    <RatingBadge score={p.rating} size="sm" />
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* FTC: commission disclosure must come BEFORE the order action */}
          {supportsCreator && creatorHandle && (
            <View style={[styles.creatorNote, { borderColor: colors.border }]}>
              <Ionicons name="heart" size={15} color={colors.orderCta} />
              <Text style={[styles.creatorNoteText, { color: colors.textMuted }]}>
                Ordering through these links supports{' '}
                <Text style={{ color: colors.text, fontWeight: '800' }}>@{creatorHandle}</Text> —
                they earn a commission. Prices are the same for you.
              </Text>
            </View>
          )}

          {/* Reserve — a table for fine dining. Recommends a service, offers
              alternatives. Leads when the place reads as reservation-first. */}
          {reserveFirst && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RESERVE A TABLE</Text>
              <View style={{ gap: 10 }}>
                {RESERVATIONS.map((r) => (
                  <Pressable
                    key={r.key}
                    onPress={() => handleReserve(r)}
                    style={({ pressed }) => [
                      styles.provider,
                      {
                        backgroundColor: r.recommended ? colors.accentSoft : colors.surface,
                        borderColor: r.recommended ? colors.accent : colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <View style={[styles.iconWrap, { backgroundColor: r.color }]}>
                      <Ionicons name={r.icon} size={22} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pLabel, { color: colors.text }]}>{r.label}</Text>
                      <Text style={[styles.pSub, { color: colors.textMuted }]}>{r.sub}</Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* Order — delivery / pickup. */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            {reserveFirst ? 'OR ORDER DELIVERY' : 'DELIVERY & PICKUP'}
          </Text>
          <View style={{ gap: 10, opacity: canOrder ? 1 : 0.4 }}>
            {PROVIDERS.map((p) => (
              <Pressable
                key={p.key}
                disabled={!canOrder}
                onPress={() => handlePick(p)}
                style={({ pressed }) => [
                  styles.provider,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}>
                <View style={[styles.iconWrap, { backgroundColor: p.color }]}>
                  <Ionicons name={p.icon} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pLabel, { color: colors.text }]}>{p.label}</Text>
                  <Text style={[styles.pSub, { color: colors.textMuted }]}>{p.sub}</Text>
                </View>
                <View style={styles.actionCol}>
                  <Ionicons name="open-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.pAction, { color: colors.textMuted }]}>{p.action}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          {hasPlateList && !canOrder && (
            <Text style={[styles.note, { color: colors.textMuted }]}>Pick at least one plate to order.</Text>
          )}

          <Text style={[styles.note, { color: colors.textMuted }]}>
            We hand you off to the provider to complete your {reserveFirst ? 'reservation or order' : 'order'}.
          </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  dish: { fontSize: 14, fontWeight: '500', marginTop: 3 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  plateName: { flex: 1, fontSize: 14, fontWeight: '700' },
  creatorNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 2 },
  creatorNoteText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pLabel: { fontSize: 16, fontWeight: '700' },
  pSub: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  actionCol: { alignItems: 'center', gap: 2 },
  pAction: { fontSize: 10, fontWeight: '600' },
  note: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
