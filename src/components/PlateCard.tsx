import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { Avatar } from '@/components/Avatar';
import { OrderProviderSheet } from '@/components/OrderProviderSheet';
import { RatingBadge } from '@/components/RatingBadge';
import { formatCount } from '@/components/StatPill';
import { foodPlaceholder } from '@/data/images';
import { Order } from '@/data/types';
import { showAlert } from '@/lib/dialog';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const DOUBLE_TAP_MS = 200;

export function PlateCard({
  order,
  onSave,
  savedOverride,
}: {
  order: Order;
  /** When set, the bookmark opens the Save-to picker instead of the quick save. */
  onSave?: () => void;
  /** Drives the bookmark's filled state when saving is collection-backed. */
  savedOverride?: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isLiked, toggleLike, isSaved, toggleSave, userFor, restaurantFor } = useData();
  const [sheet, setSheet] = useState(false);
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Never let a pending tap timer fire after unmount (stale navigation/setState).
  useEffect(
    () => () => {
      if (navTimer.current) clearTimeout(navTimer.current);
      if (burstTimer.current) clearTimeout(burstTimer.current);
    },
    [],
  );

  const user = userFor(order.userId);
  const restaurant = restaurantFor(order.restaurantId);
  const liked = isLiked(order.id);
  const saved = savedOverride ?? isSaved(order.id);

  const onPhotoPress = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      // Double tap → like with a heart burst; cancel the pending navigation.
      lastTap.current = 0;
      if (navTimer.current) clearTimeout(navTimer.current);
      if (!liked) toggleLike(order.id);
      tapLight();
      setBurst(true);
      if (burstTimer.current) clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(() => setBurst(false), 700);
    } else {
      lastTap.current = now;
      if (navTimer.current) clearTimeout(navTimer.current);
      navTimer.current = setTimeout(() => {
        navTimer.current = null;
        lastTap.current = 0;
        router.push(`/order/${order.id}`);
      }, DOUBLE_TAP_MS);
    }
  };

  const explainCommission = () => {
    showAlert(
      'This creator earns commission',
      `@${user.handle} earns when orders are placed through their plates — regardless of the rating they give. Ratings are always the creator's own opinion, and prices are the same for you.`,
    );
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(350).springify()}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* User row */}
      <View style={styles.header}>
        <Pressable style={styles.userRow} onPress={() => router.push(`/user/${user.id}`)}>
          <Avatar uri={user.avatar} size={42} verified={user.verified} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {user.name}
              </Text>
              {user.compensationEligible && (
                <Pressable
                  onPress={explainCommission}
                  hitSlop={6}
                  style={[styles.commissionTag, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="information-circle-outline" size={11} color={colors.text} />
                  <Text style={[styles.commissionTagText, { color: colors.text }]}>
                    Earns commission
                  </Text>
                </Pressable>
              )}
            </View>
            <Pressable onPress={() => restaurant && router.push(`/restaurant/${restaurant.id}`)}>
              <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
                at {restaurant?.name ?? 'a restaurant'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => router.push(`/report?targetType=plate&targetId=${order.id}`)}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Photo with scrim — dish name lives on the image (2026 pattern) */}
      <Pressable onPress={onPhotoPress}>
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
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.78)']}
          locations={[0, 0.5, 1]}
          style={styles.scrim}
          pointerEvents="none"
        />
        <View style={styles.scrimContent} pointerEvents="none">
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.dish, { fontFamily: displayFont }]} numberOfLines={2}>
              {order.dishName}
            </Text>
            {(order.reorders ?? 0) > 0 && (
              <View style={styles.reorderRow}>
                <Ionicons name="repeat" size={13} color="#FFD98A" />
                <Text style={styles.reorderText}>
                  {formatCount(order.reorders ?? 0)} reordered this plate
                </Text>
              </View>
            )}
          </View>
          <RatingBadge score={order.rating} size="md" />
        </View>
        {burst && (
          <View style={styles.burstWrap} pointerEvents="none">
            <Animated.View entering={ZoomIn.springify().damping(10)} exiting={ZoomOut.duration(250)}>
              <Ionicons name="heart" size={84} color="#FFFFFF" style={styles.burstHeart} />
            </Animated.View>
          </View>
        )}
      </Pressable>

      {/* Caption */}
      <Pressable style={styles.body} onPress={() => router.push(`/order/${order.id}`)}>
        <Text style={[styles.caption, { color: colors.textMuted }]} numberOfLines={2}>
          {order.description}
        </Text>
      </Pressable>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={() => {
            toggleLike(order.id);
            tapLight();
          }}
          hitSlop={8}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? colors.orderCta : colors.text}
          />
          <Text style={[styles.actionText, { color: colors.textMuted }]}>
            {formatCount(order.likes + (liked ? 1 : 0))}
          </Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => router.push(`/order/${order.id}`)} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
          <Text style={[styles.actionText, { color: colors.textMuted }]}>
            {formatCount(order.comments)}
          </Text>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={() => {
            // When a Save-to picker handler is supplied, the bookmark opens it
            // (multi-list membership); otherwise it's the quick single-tap save.
            if (onSave) onSave();
            else toggleSave(order.id);
            tapLight();
          }}
          hitSlop={8}>
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={saved ? colors.accent : colors.text}
          />
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
          style={[styles.orderBtn, { backgroundColor: colors.orderCta }]}
          onPress={() => {
            tapMedium();
            setSheet(true);
          }}>
          <Ionicons name="bag-handle" size={16} color={colors.orderCtaText} />
          <Text style={[styles.orderText, { color: colors.orderCtaText }]}>Order</Text>
        </Pressable>
      </View>

      <OrderProviderSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        order={order}
        restaurantName={restaurant?.name ?? ''}
        dishName={order.dishName}
        creatorHandle={user.handle}
        supportsCreator={user.compensationEligible}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1 },
  commissionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  commissionTagText: { fontSize: 10, fontWeight: '800' },
  sub: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  photo: { width: '100%', aspectRatio: 0.92 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%' },
  scrimContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
  },
  dish: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  reorderText: { color: '#FFD98A', fontSize: 12, fontWeight: '700' },
  burstWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstHeart: {
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  caption: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 13, fontWeight: '600' },
  orderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  orderText: { fontSize: 14, fontWeight: '800' },
});
