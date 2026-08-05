import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { MenuPanel } from '@/components/MenuPanel';
import { PlateList, PlatePanel } from '@/components/PlatePanel';
import type { PlaceResult } from '@/lib/places';
import { RatingBadge } from '@/components/RatingBadge';
import { useSheetDismiss } from '@/components/useSheetDismiss';
import { openDirections, openReservation } from '@/lib/external';
import { summarizeDishes } from '@/lib/dishes';
import { buildPlateShareMessage, buildRestaurantShareMessage } from '@/lib/invite';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Restaurant detail as a bottom-sheet overlay over the live map (design §2):
 * ~82% height, transparent backdrop so the map stays visible, X in the photo
 * hero. Content: name/cuisine + Plated's Rating, Directions/Reserve/Save row,
 * location line, Top-rated plates here, Top raters.
 */
export function RestaurantDetailSheet({
  restaurantId,
  onClose,
  onRoute,
  onRoutePreview,
  plateId,
  side = 'place',
  onSideChange,
  preview,
  onAdopt,
  onOpenMap,
  halfHeight,
}: {
  restaurantId: string | null;
  onClose: () => void;
  /** When provided, "Directions" draws an in-app route instead of leaving. */
  onRoute?: (restaurantId: string) => void;
  /**
   * The same, for a Foursquare preview: there's no row to look up, so the
   * destination is passed by coordinate.
   */
  onRoutePreview?: (dest: { name: string; lat: number; lng: number }) => void;
  /**
   * A specific plate at this restaurant. Set it and the sheet gains a
   * plate/place switch, so one sheet answers both "what is this dish?" and
   * "what is this place?" rather than the map opening two different screens.
   */
  plateId?: string | null;
  /** Which side is showing. Controlled, so the sheet can open on the side the
   *  tap came from: a pin opens the place, a plate opens the plate. */
  side?: 'place' | 'plate';
  onSideChange?: (side: 'place' | 'plate') => void;
  /**
   * A place Foursquare knows about that Plated doesn't. Shown from the external
   * data with nothing written: it only becomes a row when the user acts on it
   * (adds a plate or saves it), so browsing can't fill the table with places
   * nobody has rated.
   */
  preview?: PlaceResult | null;
  /** Promotes the previewed place to a real row, then continues. Returns its id. */
  onAdopt?: (place: PlaceResult, then: 'save' | 'plate') => void;
  /** When set, a "Map" button appears — opens the full-screen map on the pin. */
  onOpenMap?: () => void;
  /** Shrinks the sheet to ~half so a full-screen map shows above it. */
  halfHeight?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { restaurantWithRating, ordersByRestaurant, userFor, restaurantMenu } = useData();
  const { isSaved, openSaveSheet } = useCollections();
  // Over a full-screen map, the sheet caps low so the map + pin shows above it.
  const wrapCap = halfHeight ? styles.sheetWrapHalf : styles.sheetWrap;

  const visible = restaurantId != null || preview != null;
  // Drag the grey bar at the top of the card down to dismiss. Scoped to the bar
  // rather than the whole hero: a responder over the hero would also intercept
  // taps that drift a few points, which is most real taps on the X.
  const drag = useSheetDismiss(onClose, visible);
  const restaurant = restaurantId ? restaurantWithRating(restaurantId) : undefined;
  const orders = restaurantId ? ordersByRestaurant(restaurantId) : [];
  const menu = restaurantId ? restaurantMenu(restaurantId) : [];
  /** One entry per dish, ratings averaged — see lib/dishes. */
  const dishes = useMemo(() => summarizeDishes(orders), [orders]);

  /**
   * The menu is a second page of *this* sheet, not a pushed route: a route
   * renders under the sheet's Modal and couldn't return to the card. Back is
   * just flipping this off. Reset whenever the sheet's subject changes or it
   * closes, so it never reopens already deep in the menu.
   */
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!visible) setMenuOpen(false);
  }, [visible, restaurantId]);

  // Top raters — the distinct authors who rated a plate here, best score first.
  const raters = restaurantId
    ? Array.from(new Map(orders.map((o) => [o.userId, o])).values())
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 6)
    : [];

  const saved = restaurantId ? isSaved({ type: 'restaurant', id: restaurantId }) : false;

  const plate = plateId ? orders.find((o) => o.id === plateId) : undefined;
  // The switch is offered whenever there's anything on the plate side at all:
  // a specific dish when you tapped one, otherwise every dish rated here.
  const canSwitch = orders.length > 0 && !!onSideChange;
  const showing: 'place' | 'plate' = canSwitch && side === 'plate' ? 'plate' : 'place';

  const go = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as never), 180);
  };

  // Save opens the collection picker, which is itself a Modal. iOS can't
  // present two Modals at once, so dismiss this sheet first, then open it.
  const onSavePress = () => {
    if (!restaurantId) return;
    const id = restaurantId;
    onClose();
    setTimeout(() => openSaveSheet({ type: 'restaurant', id }), 320);
  };

  // Reserve/directions open a browser or maps view presented over this Modal;
  // dismiss the sheet first, then fire, so the presentation doesn't conflict.
  const afterClose = (fn: () => void) => {
    onClose();
    setTimeout(fn, 320);
  };

  /**
   * Shares whatever the card is currently showing. On the plate side that's the
   * dish — sharing the restaurant from a screen headed by one specific plate
   * would drop the thing the user actually meant to send.
   *
   * `plate` is the dish they tapped; with the switch on 'plate' but no specific
   * dish chosen, the best-rated one here stands in for "the plate to try".
   */
  const shareCurrent = (r: { name: string; cuisine?: string; location?: string; platedRating?: number }) => {
    const dish = plate ?? [...orders].sort((a, b) => b.rating - a.rating)[0];
    const message =
      showing === 'plate' && dish
        ? buildPlateShareMessage({
            dishName: dish.dishName,
            restaurantName: r.name,
            rating: dish.rating,
            handle: userFor(dish.userId).handle,
          })
        : buildRestaurantShareMessage({
            name: r.name,
            cuisine: r.cuisine,
            location: r.location,
            rating: r.platedRating,
          });
    Share.share({ message }).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Transparent backdrop — the map shows through, tap to dismiss. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {preview && !restaurant && (
          <Animated.View style={[wrapCap, drag.style]}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.previewHero, { backgroundColor: colors.surface }]}>
              <View style={styles.grabberWrap} pointerEvents="box-none">
                <View style={styles.grabberHit} {...drag.panHandlers}>
                  <View style={styles.grabber} />
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
              <Ionicons name="storefront-outline" size={40} color={colors.textMuted} />
              <Text
                style={[styles.previewName, { color: colors.text, fontFamily: displayFont }]}
                numberOfLines={2}>
                {preview.name}
              </Text>
              <Text style={[styles.previewMeta, { color: colors.textMuted }]} numberOfLines={1}>
                {[preview.cuisine, preview.location, preview.priceLevel].filter(Boolean).join(' · ')}
              </Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 28 }}>
              <View style={[styles.notOnPlated, { borderColor: colors.border }]}>
                <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
                <Text style={[styles.notOnPlatedText, { color: colors.textMuted }]}>
                  Nobody has rated a plate here yet. Post the first one and this place gets a Plated
                  rating, a pin, and a spot in the rankings.
                </Text>
              </View>

              <Pressable
                onPress={() => onAdopt?.(preview, 'plate')}
                style={[styles.primary, { backgroundColor: colors.accent }]}>
                <Ionicons name="add" size={18} color={colors.accentText} />
                <Text style={[styles.primaryText, { color: colors.accentText }]}>
                  Rate a plate here
                </Text>
              </Pressable>

              <View style={styles.previewRow}>
                <Pressable
                  onPress={() => onAdopt?.(preview, 'save')}
                  style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="bookmark-outline" size={16} color={colors.accent} />
                  <Text style={[styles.actionText, { color: colors.text }]}>Save</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (preview.lat == null || preview.lng == null) return;
                    const dest = { name: preview.name, lat: preview.lat, lng: preview.lng };
                    // In-app route like every other Directions in Plated; the
                    // maps hand-off lives only in the steps sheet's Navigate.
                    if (onRoutePreview) afterClose(() => onRoutePreview(dest));
                    else openDirections('google', dest as never);
                  }}
                  style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="navigate" size={16} color={colors.accent} />
                  <Text style={[styles.actionText, { color: colors.text }]}>Directions</Text>
                </Pressable>
              </View>

              <Text style={[styles.sourceNote, { color: colors.textMuted }]}>
                Details from Foursquare — they’ll be replaced by Plated’s own once someone rates a
                plate here.
              </Text>
            </ScrollView>
          </Pressable>
          </Animated.View>
        )}
        {restaurant && menuOpen && (
          // A genuine full-screen page — fills the whole Modal, top-anchored
          // header, no grabber or rounded sheet corners. It's *inside* this
          // Modal (not a pushed route) only so Back can return to the card; a
          // pushed screen would render under the Modal and land on Explore.
          <Pressable style={[styles.fullPage, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.fullHeader, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
              <Pressable onPress={() => setMenuOpen(false)} hitSlop={12} style={styles.fullBack}>
                <Ionicons name="chevron-back" size={26} color={colors.text} />
              </Pressable>
              <Text style={[styles.fullTitle, { color: colors.text, fontFamily: displayFont }]}>Menu</Text>
              <View style={{ width: 34 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
              <Text style={[styles.avgLine, { color: colors.textMuted }]}>
                {restaurant.name} · {dishes.length} {dishes.length === 1 ? 'dish' : 'dishes'} rated
              </Text>
              <MenuPanel restaurantId={restaurant.id} onOpenOrder={(oid) => go(`/order/${oid}`)} />
            </ScrollView>
          </Pressable>
        )}
        {restaurant && !menuOpen && (
          <Animated.View style={[wrapCap, drag.style]}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            {/* Photo hero — grabber + X, and the drag handle for dismissing. */}
            <View style={styles.hero}>
              <Image
                source={{ uri: orders[0]?.photo ?? restaurant.image }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={150}
              />
              <View style={styles.heroScrim} />
              <View style={styles.grabberWrap} pointerEvents="box-none">
                <View style={styles.grabberHit} {...drag.panHandlers}>
                  <View style={styles.grabber} />
                </View>
              </View>
              <Pressable onPress={() => shareCurrent(restaurant)} hitSlop={8} style={styles.shareBtn}>
                <Ionicons name="share-outline" size={19} color="#fff" />
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
              <View style={styles.heroFooter}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.heroName, { fontFamily: displayFont }]} numberOfLines={1}>
                    {restaurant.name}
                  </Text>
                  <Text style={styles.heroMeta} numberOfLines={1}>
                    {restaurant.cuisine} · {restaurant.location}
                  </Text>
                </View>
                {showing === 'place' && (
                  <View style={{ alignItems: 'center' }}>
                    <RatingBadge score={restaurant.platedRating} size="lg" />
                    <Text style={styles.heroRatingLabel}>Plated&apos;s Rating</Text>
                  </View>
                )}
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 28 }}>
              {/* Same shape as Explore's Discover/Platos toggle, so "show me the
                  other view of this" is a gesture already learned one level up. */}
              {canSwitch && (
                <View style={[styles.switcher, { backgroundColor: colors.surface }]}>
                  {(['plate', 'place'] as const).map((seg) => {
                    const on = showing === seg;
                    return (
                      <Pressable
                        key={seg}
                        onPress={() => onSideChange?.(seg)}
                        style={[styles.switchSeg, on && { backgroundColor: colors.accent }]}>
                        <Ionicons
                          name={seg === 'plate' ? 'restaurant' : 'storefront'}
                          size={14}
                          color={on ? colors.accentText : colors.textMuted}
                        />
                        <Text style={[styles.switchText, { color: on ? colors.accentText : colors.textMuted }]}>
                          {seg === 'plate' ? 'The plate' : 'The place'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {showing === 'plate' ? (
                plate ? (
                  <PlatePanel
                    order={plate}
                    onOpen={() => go(`/order/${plate.id}`)}
                    onOrder={() => go(`/order/${plate.id}?order=1`)}
                  />
                ) : (
                  // Came from a pin: no dish chosen yet, so offer all of them.
                  <PlateList orders={orders} onOpen={(id) => go(`/order/${id}`)} />
                )
              ) : (
                <>
              <Text style={[styles.avgLine, { color: colors.textMuted }]}>
                Average of {restaurant.orderCount} Plated {restaurant.orderCount === 1 ? 'rating' : 'ratings'}
              </Text>

              {/* Directions · Reserve · Save */}
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => {
                    // Prefer the in-app route (keeps the user in Plated); fall
                    // back to an external maps hand-off only where unwired.
                    if (onRoute && restaurantId) onRoute(restaurantId);
                    else openDirections('google', restaurant);
                  }}
                  style={[styles.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="navigate" size={16} color={colors.accent} />
                  <Text style={[styles.actionText, { color: colors.text }]}>Directions</Text>
                </Pressable>
                <Pressable
                  onPress={() => afterClose(() => openReservation('search', restaurant))}
                  style={[styles.actionBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                  <Ionicons name="calendar" size={16} color={colors.accentText} />
                  <Text style={[styles.actionText, { color: colors.accentText }]}>Reserve</Text>
                </Pressable>
                <Pressable
                  onPress={onSavePress}
                  style={[
                    styles.saveBtn,
                    { backgroundColor: saved ? colors.accentSoft : colors.surface, borderColor: saved ? colors.accent : colors.border },
                  ]}>
                  <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={colors.accent} />
                </Pressable>
              </View>

              <View style={styles.locLine}>
                <Ionicons name="location-outline" size={15} color={colors.accent} />
                <Text style={[styles.locText, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
                  {restaurant.location}
                </Text>
                {onOpenMap && (
                  <Pressable
                    onPress={onOpenMap}
                    style={[styles.mapBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
                    <Ionicons name="map" size={14} color={colors.accent} />
                    <Text style={[styles.mapBtnText, { color: colors.accent }]}>Map</Text>
                  </Pressable>
                )}
              </View>

              {/* Top-rated plates here — one row per *dish*, not per rating, so
                  three people rating the Flat White reads as one dish with an
                  average rather than three near-identical entries. */}
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TOP-RATED PLATES HERE</Text>
              <View style={{ gap: 10 }}>
                {/* Top 3 dishes, numbered — a podium, not an open-ended list. The
                    rest live behind the Menu button below. */}
                {dishes.slice(0, 3).map((d, i) => (
                  <Pressable
                    key={d.dishName}
                    onPress={() => go(`/order/${d.orderId}`)}
                    style={[styles.plateRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.plateRank, { color: colors.accent }]}>{i + 1}</Text>
                    <Image source={{ uri: d.photo }} style={styles.plateThumb} contentFit="cover" />
                    <Text style={[styles.plateName, { flex: 1, color: colors.text }]} numberOfLines={1}>
                      {d.dishName}
                    </Text>
                    <RatingBadge score={d.rating} size="sm" />
                  </Pressable>
                ))}
                {dishes.length === 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>Be the first to rate a plate here.</Text>
                )}
              </View>

              {/* Menu — every dish rated here, with its community score. */}
              {/* Menu is a second page of this sheet, not an inline list: it
                  grows over time, and a list-within-a-card buried Top Raters. */}
              {menu.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MENU</Text>
                  <Pressable
                    onPress={() => setMenuOpen(true)}
                    style={[styles.menuButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="restaurant-outline" size={18} color={colors.accent} />
                    <Text style={[styles.menuButtonLabel, { color: colors.text }]}>Open Menu</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                </>
              )}

              {/* Top raters */}
              {raters.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TOP RATERS</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18 }}>
                    {raters.map((o) => {
                      const u = userFor(o.userId);
                      return (
                        <Pressable key={o.userId} onPress={() => go(`/user/${u.id}`)} style={{ alignItems: 'center', gap: 6, width: 64 }}>
                          <Avatar uri={u.avatar} size={48} verified={u.verified} />
                          <Text style={[styles.raterName, { color: colors.text }]} numberOfLines={1}>
                            {u.name.split(' ')[0]}
                          </Text>
                          <RatingBadge score={o.rating} size="sm" />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}
                </>
              )}
            </ScrollView>
          </Pressable>
          </Animated.View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  previewHero: { alignItems: 'center', paddingTop: 26, paddingBottom: 20, paddingHorizontal: spacing.lg, gap: 6 },
  previewName: { fontSize: 24, textAlign: 'center', marginTop: 6 },
  previewMeta: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  notOnPlated: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
  },
  notOnPlatedText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 19 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radius.lg,
  },
  primaryText: { fontSize: 15, fontWeight: '800' },
  previewRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  sourceNote: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: spacing.lg },
  switcher: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
    marginBottom: spacing.lg,
  },
  switchSeg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  switchText: { fontSize: 13, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  /**
   * Both the wrapper and the surface are capped.
   *
   * The surface needs it because it's the view that clips and scrolls — without
   * it the body runs past the sheet and the last section is cut off instead of
   * scrolling. The wrapper needs it because it's the flex child the backdrop
   * bottom-aligns: left unbounded it grows to the content's full natural
   * height, and the capped surface then renders from *its* top, leaving the
   * sheet floating with a gap under it and the page showing through.
   */
  sheetWrap: { maxHeight: '82%' },
  sheetWrapHalf: { maxHeight: '52%' },
  sheet: {
    // No maxHeight here. A percentage resolves against the *parent*, and the
    // parent is now the animated wrapper, which is content-sized — so an 82%
    // cap clipped the surface to 82% of its own content and parked it at the
    // wrapper's top, leaving the remaining 18% as a gap under the card with the
    // page showing through. The cap belongs on the wrapper (which measures
    // against the full-screen backdrop); this just shrinks to fit it.
    flexShrink: 1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  hero: { height: 170 },
  heroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.32)' },
  // box-none on the wrap + a bounded hit area on the bar itself: the drag zone
  // is the grey bar and nothing else, so it can't swallow taps meant for the
  // share button (top-left) or the close button (top-right) beside it.
  grabberWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  grabberHit: { paddingTop: 10, paddingBottom: 16, paddingHorizontal: 44 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
  // Mirrors closeBtn across the hero: share top-left, close top-right, grey bar
  // centred between them.
  shareBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFooter: { position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroName: { fontSize: 24, fontWeight: '600', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  heroMeta: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  heroRatingLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  avgLine: { fontSize: 12, fontWeight: '500' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 14, fontWeight: '800' },
  saveBtn: { width: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  locLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  locText: { fontSize: 13, fontWeight: '500' },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mapBtnText: { fontSize: 12, fontWeight: '800' },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  plateThumb: { width: 48, height: 48, borderRadius: 10 },
  plateName: { fontSize: 14, fontWeight: '700' },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  menuButtonLabel: { flex: 1, fontSize: 15, fontWeight: '800' },
  // Full-screen menu page: fills the Modal, its own top-safe-area header.
  fullPage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fullBack: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  fullTitle: { fontSize: 20, fontWeight: '800' },
  // Rank chip on the top-3 podium rows.
  plateRank: { width: 18, textAlign: 'center', fontSize: 15, fontWeight: '900' },
  menuMeta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  raterName: { fontSize: 12, fontWeight: '700' },
});
