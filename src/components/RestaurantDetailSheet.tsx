import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { PlateList, PlatePanel } from '@/components/PlatePanel';
import type { PlaceResult } from '@/lib/places';
import { RatingBadge } from '@/components/RatingBadge';
import { openDirections, openReservation } from '@/lib/external';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Restaurant detail as a bottom-sheet overlay over the live map (design §2):
 * ~82% height, transparent backdrop so the map stays visible, X in the photo
 * hero. Content: name/cuisine + Plated's Rating, Directions/Reserve/Save row,
 * location line (+avoid-tolls note), Top-rated plates here, Top raters.
 */
export function RestaurantDetailSheet({
  restaurantId,
  onClose,
  avoidTolls = false,
  onRoute,
  plateId,
  side = 'place',
  onSideChange,
  preview,
  onAdopt,
}: {
  restaurantId: string | null;
  onClose: () => void;
  avoidTolls?: boolean;
  /** When provided, "Directions" draws an in-app route instead of leaving. */
  onRoute?: (restaurantId: string) => void;
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
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { restaurantWithRating, ordersByRestaurant, userFor, restaurantMenu } = useData();
  const { isSaved, openSaveSheet } = useCollections();

  const visible = restaurantId != null || preview != null;
  const restaurant = restaurantId ? restaurantWithRating(restaurantId) : undefined;
  const orders = restaurantId ? ordersByRestaurant(restaurantId) : [];
  const menu = restaurantId ? restaurantMenu(restaurantId) : [];

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Transparent backdrop — the map shows through, tap to dismiss. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {preview && !restaurant && (
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.previewHero, { backgroundColor: colors.surface }]}>
              <View style={styles.grabberWrap}>
                <View style={styles.grabber} />
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
                  onPress={() =>
                    preview.lat != null &&
                    preview.lng != null &&
                    openDirections('google', {
                      name: preview.name,
                      lat: preview.lat,
                      lng: preview.lng,
                    } as never, { avoidTolls })
                  }
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
        )}
        {restaurant && (
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            {/* Photo hero with grabber + X */}
            <View style={styles.hero}>
              <Image
                source={{ uri: orders[0]?.photo ?? restaurant.image }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={150}
              />
              <View style={styles.heroScrim} />
              <View style={styles.grabberWrap}>
                <View style={styles.grabber} />
              </View>
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
                    else openDirections('google', restaurant, { avoidTolls });
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
                <Text style={[styles.locText, { color: colors.textMuted }]}>
                  {restaurant.location}
                  {avoidTolls ? ' · directions avoid tolls' : ''}
                </Text>
              </View>

              {/* Top-rated plates here */}
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TOP-RATED PLATES HERE</Text>
              <View style={{ gap: 10 }}>
                {orders.slice(0, 5).map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => go(`/order/${o.id}`)}
                    style={[styles.plateRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Image source={{ uri: o.photo }} style={styles.plateThumb} contentFit="cover" />
                    <Text style={[styles.plateName, { color: colors.text }]} numberOfLines={1}>
                      {o.dishName}
                    </Text>
                    <RatingBadge score={o.rating} size="sm" />
                  </Pressable>
                ))}
                {orders.length === 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>Be the first to rate a plate here.</Text>
                )}
              </View>

              {/* Menu — every dish rated here, with its community score. */}
              {menu.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MENU</Text>
                  <View style={{ gap: 0 }}>
                    {menu.map((m) => (
                      <View key={m.name} style={[styles.menuRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.plateName, { color: colors.text }]} numberOfLines={1}>{m.name}</Text>
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
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  hero: { height: 170 },
  heroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.32)' },
  grabberWrap: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.7)' },
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
  plateName: { flex: 1, fontSize: 14, fontWeight: '700' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  menuMeta: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  raterName: { fontSize: 12, fontWeight: '700' },
});
