import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ImageSourcePropType, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RatingBadge } from '@/components/RatingBadge';
import { Order, Restaurant } from '@/data/types';
import { openInApp, openReservation } from '@/lib/external';
import { tapMedium } from '@/lib/haptics';
import { OrderPlatform, trackAffiliateClick } from '@/lib/monetization';
import { useData } from '@/store/DataContext';
import { useSettings } from '@/store/SettingsContext';
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
   * Drives the order-vs-reserve heuristic when the restaurant hasn't set an
   * explicit `orderMode`: `$$$` (fine dining) leads with Reserve and
   * recommends a service; `$` / `$$` lead with delivery/pickup. Both
   * sections still show, so it's never a dead end.
   */
  priceLevel?: '$' | '$$' | '$$$';
  /**
   * A verified owner's explicit preference (0042) — takes priority over the
   * price-level heuristic above when set.
   */
  orderMode?: Restaurant['orderMode'];
  reservationPlatform?: Restaurant['reservationPlatform'];
  reservationUrl?: string;
  /** The restaurant's own order page — shown ahead of DoorDash/UberEats search when set. */
  externalOrderUrl?: string;
  doordashStoreUrl?: string;
  ubereatsStoreUrl?: string;
  /** Handle of the person whose plate this is. */
  creatorHandle?: string;
  /** Whether ordering this plate pays commission to the creator. */
  supportsCreator?: boolean;
  /**
   * Needed to record an affiliate click. Without it the hand-off still works
   * — it just isn't tracked. Defaults to `order.restaurantId` when `order` is
   * passed, so most call sites don't need to pass this explicitly.
   */
  restaurantId?: string;
  /**
   * Who gets credited for the click. Defaults to `order.userId` (the plate's
   * author) when `order` is passed — only needs to be set explicitly for
   * flows with no `order` in scope (Platos).
   */
  creatorId?: string;
}

interface Reservation {
  key: 'opentable' | 'resy' | 'search';
  label: string;
  sub: string;
  /** Real brand mark (assets/images/providers) — absent only for the generic "search" fallback. */
  logo?: ImageSourcePropType;
  icon: keyof typeof Ionicons.glyphMap;
  recommended?: boolean;
}

// OpenTable leads as the broadest default; Resy and a general search follow.
const RESERVATIONS: Reservation[] = [
  {
    key: 'opentable',
    label: 'OpenTable',
    sub: 'Recommended · book a table',
    logo: require('../../assets/images/providers/opentable.png'),
    icon: 'restaurant',
    recommended: true,
  },
  { key: 'resy', label: 'Resy', sub: 'Book on Resy', logo: require('../../assets/images/providers/resy.png'), icon: 'wine' },
  { key: 'search', label: 'Find a reservation', sub: 'Resy, Tock & more', icon: 'search' },
];

interface Provider {
  key: OrderPlatform;
  label: string;
  sub: string;
  action: string;
  /** Real brand mark — absent for generic "Pickup", which isn't one specific company. */
  logo?: ImageSourcePropType;
  icon: keyof typeof Ionicons.glyphMap;
  url: (q: string) => string;
}

const PROVIDERS: Provider[] = [
  {
    key: 'doordash',
    label: 'DoorDash',
    sub: 'Delivery • ~25–40 min',
    action: 'Opens DoorDash',
    logo: require('../../assets/images/providers/doordash.png'),
    icon: 'bicycle',
    url: (q) => `https://www.doordash.com/search/store/${q}`,
  },
  {
    key: 'ubereats',
    label: 'Uber Eats',
    sub: 'Delivery • ~20–35 min',
    action: 'Opens Uber Eats',
    logo: require('../../assets/images/providers/ubereats.png'),
    icon: 'car',
    url: (q) => `https://www.ubereats.com/search?q=${q}`,
  },
  {
    key: 'pickup',
    label: 'Pickup',
    sub: 'Order ahead & grab it',
    action: 'Opens in browser',
    icon: 'bag-handle',
    url: (q) => `https://www.google.com/search?q=${q}+order+pickup`,
  },
];

/**
 * The little square to the left of each row. A real brand mark renders on a
 * plain white chip — several of these logos (Apple in particular) are
 * single-color and would vanish against Plated's dark theme without one, and
 * a uniform white backing keeps every provider row the same size regardless
 * of whether its actual logo is a square icon or a wide wordmark. Falls back
 * to a generic Ionicon on a tinted chip only for entries with no real logo
 * (Pickup, the generic "Find a reservation" search).
 */
function ProviderIcon({
  logo,
  icon,
  fallbackColor,
}: {
  logo?: ImageSourcePropType;
  icon: keyof typeof Ionicons.glyphMap;
  fallbackColor: string;
}) {
  if (logo) {
    return (
      <View style={styles.logoChip}>
        <Image source={logo} style={styles.logoImg} contentFit="contain" />
      </View>
    );
  }
  return (
    <View style={[styles.iconWrap, { backgroundColor: fallbackColor }]}>
      <Ionicons name={icon} size={22} color="#fff" />
    </View>
  );
}

export function OrderProviderSheet({
  visible,
  onClose,
  order,
  restaurantName,
  dishName,
  restaurantLocation,
  plates,
  priceLevel,
  orderMode,
  reservationPlatform,
  reservationUrl,
  externalOrderUrl,
  doordashStoreUrl,
  ubereatsStoreUrl,
  creatorHandle,
  supportsCreator,
  restaurantId,
  creatorId,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { markReordered } = useData();
  const { settings, update } = useSettings();

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

  // A verified owner's explicit order_mode wins; otherwise fine dining ($$$)
  // leads with Reserve and everywhere else leads with delivery/pickup.
  const reserveFirst = orderMode ? orderMode === 'reservation' : priceLevel === '$$$';

  // A restaurant with its own reservation link skips the generic
  // OpenTable/Resy/search list entirely — there's no ambiguity to offer
  // alternatives for once we already know exactly where to send them.
  const reservations: Reservation[] = reservationUrl
    ? [
        {
          key: reservationPlatform === 'resy' ? 'resy' : 'opentable',
          label: reservationPlatform === 'resy' ? 'Resy' : reservationPlatform === 'opentable' ? 'OpenTable' : 'Reserve now',
          sub: 'Book directly with this restaurant',
          logo:
            reservationPlatform === 'resy'
              ? require('../../assets/images/providers/resy.png')
              : reservationPlatform === 'opentable'
                ? require('../../assets/images/providers/opentable.png')
                : undefined,
          icon: 'restaurant',
          recommended: true,
        },
      ]
    : RESERVATIONS;

  // Query the provider searches for: the selected dishes narrow it when we have
  // a plate list, else the passed dishName.
  const orderQuery = hasPlateList ? [restaurantName, ...selectedDishes].join(' ') : `${dishName} ${restaurantName}`;
  const canOrder = !hasPlateList || selected.size > 0;

  // Falls back to `order.restaurantId`/`order.userId` so the common call sites
  // (which already pass `order`) don't need to repeat what it already carries.
  const effectiveRestaurantId = restaurantId ?? order?.restaurantId;
  const effectiveCreatorId = creatorId ?? order?.userId;

  const handlePick = async (p: Provider) => {
    tapMedium();
    if (order) markReordered(order.id);
    // First real choice between DoorDash/Uber Eats becomes sticky — next
    // time this skips straight past the chooser (see the auto-hand-off
    // effect below). Pickup/direct-order taps don't set it: those aren't
    // valid values for the remembered preference, and leaving 'ask' alone
    // means the chooser still comes up next time either way.
    if ((p.key === 'doordash' || p.key === 'ubereats') && settings.preferredOrderProvider === 'ask') {
      update('preferredOrderProvider', p.key);
    }
    // A restaurant-provided storefront link replaces the search query when
    // set (0042) — still tracked as this provider's platform either way.
    const storeUrl = p.key === 'doordash' ? doordashStoreUrl : p.key === 'ubereats' ? ubereatsStoreUrl : undefined;
    const destinationUrl = storeUrl || p.url(encodeURIComponent(orderQuery));
    const url = effectiveRestaurantId
      ? await trackAffiliateClick({
          restaurantId: effectiveRestaurantId,
          orderId: order?.id,
          creatorId: effectiveCreatorId,
          platform: p.key,
          destinationUrl,
        })
      : destinationUrl;
    Linking.openURL(url).catch(() => {});
    onClose();
  };

  // Once a provider is remembered, skip the chooser entirely for the common
  // case — a single dish, delivery-mode restaurant. A plate list still needs
  // an explicit pick of which plates to order, and a reservation hand-off
  // should never happen invisibly, so both keep showing the sheet.
  const remembered = settings.preferredOrderProvider;
  const autoHandoff = !hasPlateList && !reserveFirst && remembered !== 'ask';
  useEffect(() => {
    if (!visible || !autoHandoff) return;
    const provider = PROVIDERS.find((p) => p.key === remembered);
    if (provider) handlePick(provider);
    else onClose();
    // Only the visibility edge should re-trigger this — handlePick/onClose
    // are stable enough in practice and re-running mid-open would re-fire
    // the hand-off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoHandoff, remembered]);

  // The restaurant's own order page (0042) — no affiliate network sits
  // between us and it, so there's nothing to track, unlike the marketplace
  // providers above.
  const handleOrderDirect = () => {
    tapMedium();
    if (order) markReordered(order.id);
    Linking.openURL(externalOrderUrl!).catch(() => {});
    onClose();
  };

  const handleReserve = (r: Reservation) => {
    tapMedium();
    if (reservationUrl) openInApp(reservationUrl);
    else openReservation(r.key, { name: restaurantName, location: restaurantLocation });
    onClose();
  };

  return (
    <Modal visible={visible && !autoHandoff} transparent animationType="slide" onRequestClose={onClose}>
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
                {reservations.map((r) => (
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
                    <ProviderIcon logo={r.logo} icon={r.icon} fallbackColor="#6B7280" />
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
            {!!externalOrderUrl && (
              <Pressable
                disabled={!canOrder}
                onPress={handleOrderDirect}
                style={({ pressed }) => [
                  styles.provider,
                  { backgroundColor: colors.accentSoft, borderColor: colors.accent, opacity: pressed ? 0.85 : 1 },
                ]}>
                <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
                  <Ionicons name="restaurant" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pLabel, { color: colors.text }]}>Order on {restaurantName}&apos;s site</Text>
                  <Text style={[styles.pSub, { color: colors.textMuted }]}>Recommended · straight to the restaurant</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={colors.textMuted} />
              </Pressable>
            )}
            {PROVIDERS.map((p) => (
              <Pressable
                key={p.key}
                disabled={!canOrder}
                onPress={() => handlePick(p)}
                style={({ pressed }) => [
                  styles.provider,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                ]}>
                <ProviderIcon logo={p.logo} icon={p.icon} fallbackColor="#3B82F6" />
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
  logoChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 6,
  },
  logoImg: { width: '100%', height: '100%' },
  pLabel: { fontSize: 16, fontWeight: '700' },
  pSub: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  actionCol: { alignItems: 'center', gap: 2 },
  pAction: { fontSize: 10, fontWeight: '600' },
  note: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
