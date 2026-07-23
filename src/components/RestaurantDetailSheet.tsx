import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
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
}: {
  restaurantId: string | null;
  onClose: () => void;
  avoidTolls?: boolean;
  /** When provided, "Directions" draws an in-app route instead of leaving. */
  onRoute?: (restaurantId: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { restaurantWithRating, ordersByRestaurant, userFor, restaurantMenu } = useData();
  const { isSaved, openSaveSheet } = useCollections();

  const visible = restaurantId != null;
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

  const go = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as never), 180);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Transparent backdrop — the map shows through, tap to dismiss. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
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
                <View style={{ alignItems: 'center' }}>
                  <RatingBadge score={restaurant.platedRating} size="lg" />
                  <Text style={styles.heroRatingLabel}>Plated&apos;s Rating</Text>
                </View>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 28 }}>
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
                  onPress={() => openReservation('opentable', restaurant)}
                  style={[styles.actionBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                  <Ionicons name="calendar" size={16} color={colors.accentText} />
                  <Text style={[styles.actionText, { color: colors.accentText }]}>Reserve</Text>
                </Pressable>
                <Pressable
                  onPress={() => openSaveSheet({ type: 'restaurant', id: restaurant.id })}
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
            </ScrollView>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
