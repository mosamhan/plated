import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { Avatar } from '@/components/Avatar';
import { OrderProviderSheet } from '@/components/OrderProviderSheet';
import { PlateCarousel } from '@/components/PlateCarousel';
import { PlateCommentsSheet } from '@/components/PlateCommentsSheet';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { RatingBadge } from '@/components/RatingBadge';
import { SendToSheet } from '@/components/SendToSheet';
import { formatCount } from '@/components/StatPill';
import { foodPlaceholder } from '@/data/images';
import { Order } from '@/data/types';
import { collabEarningsNote, collabLabel } from '@/lib/collabs';
import { formatRelativeDate } from '@/lib/dates';
import { showAlert } from '@/lib/dialog';
import { exploreFocusHref } from '@/lib/inAppRoute';
import { postMedia } from '@/lib/post';
import { buildPlateShareMessage, plateLink } from '@/lib/invite';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useStories } from '@/store/StoriesContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const DOUBLE_TAP_MS = 200;

/**
 * Counts actual taps so the like/save icon's `entering` pop only plays when
 * this fires — never on mount. Comparing old/new key values (the previous
 * approach) still remounts on the icon's *first* render whenever that render
 * happens to be the icon's genuine first mount, which is every card on a
 * cold app start — so the whole feed's hearts popped in together on launch.
 * A tap-only counter sidesteps that: the key starts at 0 (`entering` is
 * `undefined`, no animation possible) and only becomes truthy — remounting
 * the view with `entering` attached — once something has actually called
 * `bump()`.
 */
function useTapBurst(): [number, () => void] {
  const [n, setN] = useState(0);
  return [n, () => setN((v) => v + 1)];
}

export function PlateCard({
  order,
  onSave,
  savedOverride,
  promoted,
}: {
  order: Order;
  /** When set, the bookmark opens the Save-to picker instead of the quick save. */
  onSave?: () => void;
  /** Drives the bookmark's filled state when saving is collection-backed. */
  savedOverride?: boolean;
  /** The restaurant paid to pin this plate to the top of the feed — a feed bump. */
  promoted?: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isLiked, toggleLike, isSaved, toggleSave, userFor, restaurantFor, currentUser, deleteOrder, setOrderVisibility, setOrderArchived } = useData();
  const { storiesFor, isSeen } = useStories();
  const [sheet, setSheet] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Which plate of the carousel is on screen — what Share and Send-to act on.
  const [plateIndex, setPlateIndex] = useState(0);
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
  const collabs = collabLabel(order.collaborators, (id) => userFor(id).handle);
  const restaurant = restaurantFor(order.restaurantId);

  // Visibility (public vs. friends-only) is already enforced server-side —
  // a story only ever reaches `storiesFor` if this viewer is allowed to see
  // it, so there's nothing further to gate here.
  const authorStories = storiesFor(user.id);
  const authorStoryRing: 'unseen' | 'seen' | undefined =
    authorStories.length === 0 ? undefined : authorStories.every((s) => isSeen(s.id)) ? 'seen' : 'unseen';
  const openAuthorAvatar = () => {
    tapLight();
    router.push(authorStories.length > 0 ? `/story/${user.id}` : `/user/${user.id}`);
  };

  // Sharing leads with people ("you have to try this"), so the button opens the
  // Send-to sheet rather than the system share sheet — which is still one tap
  // away inside it.
  //
  // What gets shared is the plate you're looking at. A post is a carousel of
  // several dishes now, and "this" means the one on screen — sharing the whole
  // post as an average is a number nobody chose and no recipient can act on.
  const media = postMedia(order);
  const plate = media[Math.min(plateIndex, media.length - 1)] ?? media[0];
  const sharePost = () => {
    tapLight();
    setSendOpen(true);
  };
  const shareMessage = buildPlateShareMessage({
    orderId: order.id,
    dishName: plate.dishName || order.dishName,
    rating: plate.rating || order.rating,
    restaurantName: restaurant?.name,
    handle: user.handle,
    earns: order.monetizable,
  });
  const liked = isLiked(order.id);
  const saved = savedOverride ?? isSaved(order.id);
  const [likeBurst, bumpLikeBurst] = useTapBurst();
  const [saveBurst, bumpSaveBurst] = useTapBurst();

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
    const base = `@${user.handle} earns when orders are placed through their plates — regardless of the rating they give. Ratings are always the creator's own opinion, and prices are the same for you.`;
    showAlert(
      'This creator earns commission',
      collabs ? `${base}\n\n${collabEarningsNote(user.handle)}` : base,
    );
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(350).springify()}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* User row */}
      <View style={styles.header}>
        <View style={styles.userRow}>
          <Avatar
            uri={user.avatar}
            size={42}
            verified={user.verified}
            storyRing={authorStoryRing}
            onPress={openAuthorAvatar}
          />
          <Pressable style={{ marginLeft: 10, flex: 1 }} onPress={() => router.push(`/user/${user.id}`)}>
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
            {/* Opens the place on the Discover map rather than a detail screen:
                from the feed, "where is this?" is the question, and the map
                answers it with the card on top. */}
            <Pressable onPress={() => restaurant && router.navigate(exploreFocusHref(restaurant.id))}>
              <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
                at {restaurant?.name ?? 'a restaurant'}
                {collabs ? ` · with ${collabs}` : ''}
              </Text>
            </Pressable>
          </Pressable>
        </View>
        {/* A feed bump, not a badge the poster earns — reads as an ad
            disclosure (neutral, muted) rather than the accent-colored
            commission tag above, which is about the creator, not the restaurant. */}
        {promoted && (
          <View style={[styles.promotedTag, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="megaphone-outline" size={11} color={colors.textMuted} />
            <Text style={[styles.promotedTagText, { color: colors.textMuted }]}>Promoted</Text>
          </View>
        )}
        <Pressable hitSlop={8} onPress={() => setOptionsOpen(true)}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Swipeable plate carousel — one page per dish, each with its own
          name + rating; a double-tap on any page still likes the post. */}
      <View>
        <PlateCarousel
          media={media}
          onPress={onPhotoPress}
          reorders={order.reorders ?? 0}
          colorSurface={colors.surface}
          onIndexChange={setPlateIndex}
        />
        {burst && (
          <View style={styles.burstWrap} pointerEvents="none">
            <Animated.View entering={ZoomIn.springify().damping(10)} exiting={ZoomOut.duration(250)}>
              <Ionicons name="heart" size={84} color="#FFFFFF" style={styles.burstHeart} />
            </Animated.View>
          </View>
        )}
      </View>

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
            bumpLikeBurst();
          }}
          hitSlop={8}>
          <Animated.View
            key={likeBurst || undefined}
            entering={likeBurst ? ZoomIn.springify().damping(12) : undefined}>
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={22}
              color={liked ? colors.orderCta : colors.text}
            />
          </Animated.View>
          {/* Count hidden when the poster hid it (still shown to the poster). */}
          {!(order.hideLikeCount && order.userId !== currentUser.id) && (
            <Text style={[styles.actionText, { color: colors.textMuted }]}>
              {formatCount(order.likes + (liked ? 1 : 0))}
            </Text>
          )}
        </Pressable>
        {/* Opens a sheet rather than pushing the post: saying one line shouldn't
            cost you your place in the feed. Same shape as Plato comments. */}
        <Pressable
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel="Comments"
          onPress={() => {
            tapLight();
            setCommentsOpen(true);
          }}
          hitSlop={8}>
          <Ionicons name={order.commentsDisabled ? 'chatbubble-ellipses-outline' : 'chatbubble-outline'} size={20} color={colors.text} />
          {!order.commentsDisabled && (
            <Text style={[styles.actionText, { color: colors.textMuted }]}>
              {formatCount(order.comments)}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={() => {
            // When a Save-to picker handler is supplied, the bookmark opens it
            // (multi-list membership); otherwise it's the quick single-tap save.
            if (onSave) onSave();
            else toggleSave(order.id);
            tapLight();
            bumpSaveBurst();
          }}
          hitSlop={8}>
          <Animated.View
            key={saveBurst || undefined}
            entering={saveBurst ? ZoomIn.springify().damping(12) : undefined}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={saved ? colors.accent : colors.text}
            />
          </Animated.View>
        </Pressable>
        <Pressable style={styles.action} onPress={sharePost} hitSlop={8}>
          <Ionicons name="share-outline" size={20} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1 }} />

        <AnimatedPressable
          style={[styles.orderBtn, { backgroundColor: colors.orderCta }]}
          pressScale={0.95}
          onPress={() => {
            tapMedium();
            setSheet(true);
          }}>
          <Ionicons name="bag-handle" size={16} color={colors.orderCtaText} />
          <Text style={[styles.orderText, { color: colors.orderCtaText }]}>Order</Text>
        </AnimatedPressable>
      </View>

      {/* Under the controls, not the header — the header is "who/where," this
          is "when," and grouping it with the actions row keeps the header
          focused on identity while every post still shows its age at a glance. */}
      <Text style={[styles.time, styles.timeUnderActions, { color: colors.textMuted }]} numberOfLines={1}>
        {formatRelativeDate(order.createdAt)}
      </Text>

      <OrderProviderSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        order={order}
        restaurantName={restaurant?.name ?? ''}
        restaurantLocation={restaurant?.location}
        dishName={order.dishName}
        priceLevel={restaurant?.priceLevel}
        orderMode={restaurant?.orderMode}
        reservationPlatform={restaurant?.reservationPlatform}
        reservationUrl={restaurant?.reservationUrl}
        externalOrderUrl={restaurant?.externalOrderUrl}
        doordashStoreUrl={restaurant?.doordashStoreUrl}
        ubereatsStoreUrl={restaurant?.ubereatsStoreUrl}
        creatorHandle={user.handle}
        supportsCreator={user.compensationEligible}
      />

      <PostOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        isOwner={order.userId === currentUser.id}
        visibility={order.visibility ?? 'public'}
        archived={!!order.archived}
        reportTarget={`/report?targetType=plate&targetId=${order.id}`}
        onSetVisibility={(v) => setOrderVisibility(order.id, v)}
        onSetArchived={(a) => setOrderArchived(order.id, a)}
        onDelete={() => deleteOrder(order.id)}
      />

      <PlateCommentsSheet
        orderId={order.id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />

      <SendToSheet
        visible={sendOpen}
        onClose={() => setSendOpen(false)}
        payload={{
          kind: 'plate',
          attachmentId: order.id,
          attachmentIndex: plateIndex,
          shareMessage,
          link: plateLink(order.id),
          label: `the ${plate.dishName || order.dishName}`,
        }}
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
  promotedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
  },
  promotedTagText: { fontSize: 10, fontWeight: '700' },
  sub: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  time: { fontSize: 11, fontWeight: '500', marginTop: 1 },
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
  timeUnderActions: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, marginTop: -spacing.sm },
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
