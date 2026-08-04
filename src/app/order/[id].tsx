import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { OrderProviderSheet } from '@/components/OrderProviderSheet';
import { RatingBadge } from '@/components/RatingBadge';
import { PlateCarousel } from '@/components/PlateCarousel';
import { ScreenHeader } from '@/components/ScreenHeader';
import { formatCount } from '@/components/StatPill';
import { collabLabel } from '@/lib/collabs';
import { buildPlateShareMessage } from '@/lib/invite';
import { postAverageRating, postMedia, postShareArgs } from '@/lib/post';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useCollections } from '@/store/CollectionsContext';
import { useData } from '@/store/DataContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    orders,
    isLiked,
    toggleLike,
    isSaved,
    toggleSave,
    isFollowing,
    toggleFollow,
    hasReordered,
    commentsFor,
    addComment,
    currentUser,
    userFor,
    restaurantFor,
  } = useData();
  const { openSaveSheet } = useCollections();
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState('');

  const order = orders.find((o) => o.id === id);
  // Which plates are ticked for ordering. Seeded to "all on" once the order
  // loads — the common case is ordering the whole spread. Keyed by media index.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const media = order ? postMedia(order) : [];
  useEffect(() => {
    if (order) setSelected(new Set(media.map((_, i) => i)));
    // Reset when the post changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Plate" />
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
          Plate not found.
        </Text>
      </View>
    );
  }

  const user = userFor(order.userId);
  const collabs = collabLabel(order.collaborators, (id) => userFor(id).handle);
  const restaurant = restaurantFor(order.restaurantId);
  const multiPlate = media.length > 1;
  const selectedMedia = media.filter((_, i) => selected.has(i));
  const toggleSelect = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const sharePlateAt = (dishName: string, rating: number) => {
    tapLight();
    Share.share({
      message: buildPlateShareMessage({
        dishName,
        restaurantName: restaurant?.name,
        rating,
        handle: user.handle,
      }),
    }).catch(() => {});
  };

  // Header share = the whole post (all plates), distinct from a per-plate share.
  const sharePost = () => {
    tapLight();
    Share.share({
      message: buildPlateShareMessage({
        ...postShareArgs(order),
        restaurantName: restaurant?.name,
        handle: user.handle,
      }),
    }).catch(() => {});
  };

  // Save the compiled order to a collection. The unit saved is the post (saved
  // items are keyed by post id), so this bookmarks the spot+order to revisit;
  // the selection tells the provider hand-off what to search for.
  const saveOrderToCollection = () => {
    tapLight();
    openSaveSheet({ type: 'plate', id: order.id });
  };

  const liked = isLiked(order.id);
  const saved = isSaved(order.id);
  const following = isFollowing(user.id);
  const reordered = hasReordered(order.id);
  const comments = commentsFor(order.id);

  const submitComment = () => {
    const text = draft.trim();
    if (!text) return;
    addComment(order.id, text);
    setDraft('');
    tapLight();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.headerOverlay}>
        <ScreenHeader
          transparent
          // Share sits left of save — shares the whole post (every plate).
          secondaryIcon="share-outline"
          onSecondary={sharePost}
          rightIcon={saved ? 'bookmark' : 'bookmark-outline'}
          onRight={() => {
            toggleSave(order.id);
            tapLight();
          }}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        {/* Same swipeable carousel as the feed, so the detail matches the post. */}
        <PlateCarousel
          media={media}
          onPress={() => {}}
          reorders={order.reorders ?? 0}
          colorSurface={colors.surface}
        />

        <View style={styles.body}>
          <Animated.View entering={FadeInDown.duration(300)} style={styles.titleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.dishTitle, { color: colors.text, fontFamily: displayFont }]}>
                {multiPlate ? `${media.length} plates` : order.dishName}
              </Text>
              <Pressable onPress={() => restaurant && router.push(`/restaurant/${restaurant.id}`)}>
                <Text style={[styles.restaurant, { color: colors.accent }]}>
                  {restaurant?.name} · {restaurant?.location}
                </Text>
              </Pressable>
              {collabs && (
                <Text style={[styles.collab, { color: colors.textMuted }]} numberOfLines={1}>
                  <Ionicons name="people" size={13} color={colors.textMuted} /> with {collabs}
                </Text>
              )}
              {(order.reorders ?? 0) > 0 && (
                <View style={styles.reorderRow}>
                  <Ionicons name="repeat" size={14} color={colors.success} />
                  <Text style={[styles.reorderText, { color: colors.success }]}>
                    {formatCount(order.reorders ?? 0)} people reordered this plate
                    {reordered ? ' — including you' : ''}
                  </Text>
                </View>
              )}
            </View>
            {/* Multi-plate posts show the average of their plates; a single
                plate shows its own score. */}
            <View style={{ alignItems: 'center' }}>
              <RatingBadge score={multiPlate ? postAverageRating(order) : order.rating} size="lg" />
              {multiPlate && <Text style={[styles.avgTag, { color: colors.textMuted }]}>avg</Text>}
            </View>
          </Animated.View>

          {/* Creator */}
          <Animated.View entering={FadeInDown.delay(60).duration(300)}>
            <Pressable
              onPress={() => router.push(`/user/${user.id}`)}
              style={[styles.creatorRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Avatar uri={user.avatar} size={46} verified={user.verified} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.creatorName, { color: colors.text }]}>{user.name}</Text>
                <Text style={[styles.creatorMeta, { color: colors.textMuted }]}>
                  {formatCount(user.followers)} followers
                  {user.compensationEligible ? ' · earns commission' : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => toggleFollow(user.id)}
                style={[
                  styles.followBtn,
                  following
                    ? { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }
                    : { backgroundColor: colors.accent },
                ]}>
                <Text
                  style={{
                    color: following ? colors.textMuted : colors.accentText,
                    fontWeight: '800',
                    fontSize: 13,
                  }}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(300)}>
            <Text style={[styles.desc, { color: colors.text }]}>{order.description}</Text>

            {/* Order — every plate/drink on the post, tick the ones you want.
                The bottom bar orders (or saves) exactly this selection. Each
                row shares that specific plate; the header shares the whole
                post. Per-plate *save* isn't offered yet — saved items are keyed
                by post, so a single plate can't be saved apart from its post
                until media entries get their own ids. */}
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.orderHead}>
                <Text style={[styles.alsoLabel, { color: colors.textMuted }]}>ORDER</Text>
                {multiPlate && (
                  <Pressable
                    onPress={() =>
                      setSelected(selected.size === media.length ? new Set() : new Set(media.map((_, i) => i)))
                    }
                    hitSlop={8}>
                    <Text style={[styles.selectAll, { color: colors.accent }]}>
                      {selected.size === media.length ? 'Clear all' : 'Select all'}
                    </Text>
                  </Pressable>
                )}
              </View>
              {media.map((m, i) => {
                const on = selected.has(i);
                return (
                  <View key={i} style={[styles.orderRow, { borderColor: colors.border }]}>
                    <Pressable onPress={() => toggleSelect(i)} style={styles.orderTick} hitSlop={6}>
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={on ? colors.accent : colors.textMuted}
                      />
                    </Pressable>
                    <Image source={{ uri: m.uri }} style={styles.orderThumb} contentFit="cover" />
                    <Text style={[styles.orderName, { color: colors.text }]} numberOfLines={1}>
                      {m.dishName || 'Plate'}
                    </Text>
                    <RatingBadge score={m.rating} size="sm" />
                    <Pressable onPress={() => sharePlateAt(m.dishName, m.rating)} hitSlop={6} style={{ marginLeft: 8 }}>
                      <Ionicons name="share-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.tags}>
              {order.tags.map((t) => (
                <View key={t} style={[styles.tag, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[styles.tagText, { color: colors.text }]}>{t}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.engagement, { borderColor: colors.border }]}>
              <Pressable
                style={styles.engItem}
                onPress={() => {
                  toggleLike(order.id);
                  tapLight();
                }}>
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={22}
                  color={liked ? colors.orderCta : colors.text}
                />
                {/* The poster hid the count — the heart still works, the total
                    just isn't shown to anyone but them. */}
                {!(order.hideLikeCount && order.userId !== currentUser.id) && (
                  <Text style={[styles.engText, { color: colors.textMuted }]}>
                    {formatCount(order.likes + (liked ? 1 : 0))} likes
                  </Text>
                )}
              </Pressable>
              <Pressable
                style={styles.engItem}
                onPress={() => router.push(`/report?targetType=plate&targetId=${order.id}`)}>
                <Ionicons name="flag-outline" size={18} color={colors.textMuted} />
                <Text style={[styles.engText, { color: colors.textMuted }]}>Report</Text>
              </Pressable>
            </View>
          </Animated.View>

          {/* Comments — the poster can turn these off at create time. */}
          <Animated.View entering={FadeInDown.delay(180).duration(300)}>
            <Text style={[typography.heading, { color: colors.text, marginTop: spacing.xl }]}>
              {order.commentsDisabled ? 'Comments off' : `Comments (${comments.length})`}
            </Text>
            {order.commentsDisabled && (
              <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: spacing.sm }}>
                The poster turned off commenting for this post.
              </Text>
            )}
            {!order.commentsDisabled && (
            <>
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {comments.map((c) => {
                const cu = c.userId === currentUser.id ? currentUser : userFor(c.userId);
                return (
                  <View key={c.id} style={styles.commentRow}>
                    <Pressable onPress={() => router.push(`/user/${cu.id}`)}>
                      <Avatar uri={cu.avatar} size={34} />
                    </Pressable>
                    <View style={[styles.commentBubble, { backgroundColor: colors.surface }]}>
                      <View style={styles.commentHead}>
                        <Text style={[styles.commentName, { color: colors.text }]}>{cu.name}</Text>
                        <View style={styles.commentHeadRight}>
                          <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                            {timeAgo(c.createdAt)}
                          </Text>
                          {/* Apple 1.2: every piece of UGC needs a report path */}
                          <Pressable
                            hitSlop={8}
                            onPress={() =>
                              router.push(`/report?targetType=comment&targetId=${c.id}`)
                            }>
                            <Ionicons name="flag-outline" size={13} color={colors.textMuted} />
                          </Pressable>
                        </View>
                      </View>
                      <Text style={[styles.commentText, { color: colors.text }]}>{c.text}</Text>
                    </View>
                  </View>
                );
              })}
              {comments.length === 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  No comments yet — be the first.
                </Text>
              )}
            </View>

            <View style={[styles.commentInputRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add a comment…"
                placeholderTextColor={colors.textMuted}
                style={[styles.commentInput, { color: colors.text }]}
                onSubmitEditing={submitComment}
                returnKeyType="send"
              />
              <Pressable onPress={submitComment} hitSlop={8} disabled={!draft.trim()}>
                <Ionicons
                  name="arrow-up-circle"
                  size={30}
                  color={draft.trim() ? colors.accent : colors.border}
                />
              </Pressable>
            </View>
            </>
            )}
          </Animated.View>
        </View>
      </ScrollView>

      {/* Sticky order CTA */}
      <View
        style={[
          styles.cta,
          { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 },
        ]}>
        {/* Two actions: hand the selection to a delivery/pickup provider, or —
            for a spot you can't order from — save the compiled order to a
            collection to revisit. Both act on exactly the ticked plates. Save
            is the secondary (square) button so ordering stays the emphasis. */}
        <Pressable
          onPress={saveOrderToCollection}
          disabled={selected.size === 0}
          style={[styles.ctaSave, { backgroundColor: colors.surface, borderColor: colors.border, opacity: selected.size ? 1 : 0.4 }]}>
          <Ionicons name="bookmark-outline" size={20} color={colors.accent} />
        </Pressable>
        <Pressable
          style={[styles.ctaBtn, { backgroundColor: colors.orderCta, opacity: selected.size ? 1 : 0.4 }]}
          disabled={selected.size === 0}
          onPress={() => {
            tapMedium();
            setSheet(true);
          }}>
          <Ionicons name={reordered ? 'repeat' : 'bag-handle'} size={20} color={colors.orderCtaText} />
          <Text style={[styles.ctaText, { color: colors.orderCtaText }]}>
            {multiPlate ? `Order ${selectedMedia.length} selected` : reordered ? 'Order it again' : 'Order this plate'}
          </Text>
        </Pressable>
      </View>

      <OrderProviderSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        order={order}
        restaurantName={restaurant?.name ?? ''}
        dishName={
          selectedMedia.length
            ? selectedMedia.map((m) => m.dishName).filter(Boolean).join(', ')
            : order.dishName
        }
        creatorHandle={user.handle}
        supportsCreator={user.compensationEligible}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  hero: { width: '100%', aspectRatio: 1 },
  body: { padding: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  dishTitle: { fontSize: 26, lineHeight: 31, letterSpacing: -0.4 },
  restaurant: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  collab: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  reorderText: { fontSize: 13, fontWeight: '700' },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.lg,
  },
  creatorName: { fontSize: 15, fontWeight: '800' },
  creatorMeta: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  followBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  desc: { fontSize: 15, fontWeight: '500', lineHeight: 22, marginTop: spacing.lg },
  alsoLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
  avgTag: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  orderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  selectAll: { fontSize: 13, fontWeight: '800' },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orderTick: {},
  orderThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.06)' },
  orderName: { flex: 1, fontSize: 14, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.lg },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  tagText: { fontSize: 13, fontWeight: '700' },
  engagement: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  engItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  engText: { fontSize: 14, fontWeight: '600' },
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentBubble: { flex: 1, borderRadius: radius.md, padding: 12 },
  commentHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  commentHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { fontSize: 13, fontWeight: '800' },
  commentTime: { fontSize: 12, fontWeight: '500' },
  commentText: { fontSize: 14, fontWeight: '500', lineHeight: 19 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.lg,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  commentInput: { flex: 1, fontSize: 14, fontWeight: '500', paddingVertical: 8 },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaSave: {
    width: 56,
    paddingVertical: 15,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  ctaText: { fontSize: 16, fontWeight: '800' },
});
