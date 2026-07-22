import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { ScreenHeader } from '@/components/ScreenHeader';
import { formatCount } from '@/components/StatPill';
import { foodPlaceholder } from '@/data/images';
import { tapLight, tapMedium } from '@/lib/haptics';
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
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState('');

  const order = orders.find((o) => o.id === id);
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
  const restaurant = restaurantFor(order.restaurantId);
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
          rightIcon={saved ? 'bookmark' : 'bookmark-outline'}
          onRight={() => {
            toggleSave(order.id);
            tapLight();
          }}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <Image
          source={{ uri: order.photo }}
          placeholder={foodPlaceholder(order.id)}
          placeholderContentFit="cover"
          transition={{ duration: 250, effect: 'cross-dissolve', timing: 'ease-out' }}
          priority="high"
          style={[styles.hero, { backgroundColor: colors.surface }]}
          contentFit="cover"
        />

        <View style={styles.body}>
          <Animated.View entering={FadeInDown.duration(300)} style={styles.titleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.dishTitle, { color: colors.text, fontFamily: displayFont }]}>
                {order.dishName}
              </Text>
              <Pressable onPress={() => restaurant && router.push(`/restaurant/${restaurant.id}`)}>
                <Text style={[styles.restaurant, { color: colors.accent }]}>
                  {restaurant?.name} · {restaurant?.location}
                </Text>
              </Pressable>
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
            <RatingBadge score={order.rating} size="lg" />
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

            {/* The rest of the order — other menu items, each with its rating. */}
            {order.items && order.items.length > 1 && (
              <View style={{ marginTop: spacing.md }}>
                <Text style={[styles.alsoLabel, { color: colors.textMuted }]}>ALSO ON THIS ORDER</Text>
                {order.items
                  .filter((it) => it.name !== order.dishName)
                  .map((it) => (
                    <View key={it.name} style={[styles.alsoRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.alsoName, { color: colors.text }]} numberOfLines={1}>{it.name}</Text>
                      <RatingBadge score={it.rating} size="sm" />
                    </View>
                  ))}
              </View>
            )}

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
                <Text style={[styles.engText, { color: colors.textMuted }]}>
                  {formatCount(order.likes + (liked ? 1 : 0))} likes
                </Text>
              </Pressable>
              <Pressable
                style={styles.engItem}
                onPress={() => router.push(`/report?targetType=plate&targetId=${order.id}`)}>
                <Ionicons name="flag-outline" size={18} color={colors.textMuted} />
                <Text style={[styles.engText, { color: colors.textMuted }]}>Report</Text>
              </Pressable>
            </View>
          </Animated.View>

          {/* Comments */}
          <Animated.View entering={FadeInDown.delay(180).duration(300)}>
            <Text style={[typography.heading, { color: colors.text, marginTop: spacing.xl }]}>
              Comments ({comments.length})
            </Text>
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
          </Animated.View>
        </View>
      </ScrollView>

      {/* Sticky order CTA */}
      <View
        style={[
          styles.cta,
          { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 },
        ]}>
        <Pressable
          style={[styles.ctaBtn, { backgroundColor: colors.orderCta }]}
          onPress={() => {
            tapMedium();
            setSheet(true);
          }}>
          <Ionicons name={reordered ? 'repeat' : 'bag-handle'} size={20} color={colors.orderCtaText} />
          <Text style={[styles.ctaText, { color: colors.orderCtaText }]}>
            {reordered ? 'Order it again' : 'Order this plate'}
          </Text>
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
  alsoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  alsoName: { flex: 1, fontSize: 14, fontWeight: '600' },
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
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  ctaText: { fontSize: 16, fontWeight: '800' },
});
