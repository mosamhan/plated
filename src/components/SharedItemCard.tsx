import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { RatingBadge } from '@/components/RatingBadge';
import { formatCount } from '@/components/StatPill';
import { MessageKind } from '@/data/messages';
import { postMedia } from '@/lib/post';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { useStories } from '@/store/StoriesContext';
import { displayFont } from '@/theme/fonts';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A shared plate, Plato or restaurant inside a thread — each one a shrunk
 * version of the exact tile that same thing already renders as elsewhere in
 * the app (the feed card, the Plato grid tile, the restaurant card), so a
 * share looks like the thing rather than a bespoke one-off invented for chat.
 *
 * A `Pressable` of its own would swallow the bubble's tap/double-tap/long-
 * press before the bubble ever saw it, so unlike `PlatoTile`/`PlateTile`
 * this stays a plain View — the surrounding bubble owns every gesture.
 *
 * Fixed-width on purpose: the text column below the photo is `flex: 1`,
 * which contributes nothing to intrinsic width — so without an explicit
 * width the whole thing collapses to the thumbnail and ellipsises
 * everything else.
 */

const POST_WIDTH = 252;
// A Plato's 3:4 photo already reads taller than a plate's square one at the
// same width — a touch narrower keeps the two from feeling mismatched in
// height when they land back to back in a thread.
const PLATO_WIDTH = 208;

/**
 * Where a shared attachment leads. Returned rather than navigated internally so
 * the card can stay a plain View: the bubble owns every gesture on it (single
 * tap opens, double tap reacts, long press opens the emoji bar), and a nested
 * Pressable here would swallow the taps before the bubble ever saw them.
 */
export function sharedItemHref(kind: MessageKind, attachmentId?: string, commentPostId?: string): string | null {
  if (kind === 'plate_comment') return commentPostId ? `/order/${commentPostId}?commentId=${attachmentId}` : null;
  if (kind === 'plato_comment') return commentPostId ? `/plato/${commentPostId}?commentId=${attachmentId}` : null;
  if (!attachmentId) return null;
  if (kind === 'plate') return `/order/${attachmentId}`;
  if (kind === 'plato') return `/plato/${attachmentId}`;
  // Same route Discover itself opens a restaurant on — its own back button
  // returns here, to this exact conversation, for free.
  if (kind === 'restaurant') return `/restaurant/${attachmentId}`;
  return null;
}

export function SharedItemCard({
  kind,
  attachmentId,
  /** Which plate of a multi-plate post was shared. Defaults to the first. */
  attachmentIndex,
  /** Tint for text drawn on the sender's own (accent) bubble. */
  onAccent,
  /** For `plate_comment`/`plato_comment` — see Message's fields of the same name. */
  commentAuthorId,
  commentText,
}: {
  kind: MessageKind;
  attachmentId?: string;
  attachmentIndex?: number;
  onAccent?: boolean;
  commentAuthorId?: string;
  commentText?: string;
}) {
  const { colors } = useTheme();
  const { orders, restaurantFor, restaurantWithRating, userFor } = useData();
  const { platos } = usePlatos();

  if (kind === 'plate_comment' || kind === 'plato_comment') {
    return (
      <SharedCommentCard authorId={commentAuthorId} text={commentText} onAccent={onAccent} />
    );
  }

  if (!attachmentId) return null;

  const metaColor = onAccent ? 'rgba(255,255,255,0.78)' : colors.textMuted;

  const missing = (label: string, width: number) => (
    <View
      style={[
        styles.gone,
        { width, backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      <Ionicons name="eye-off-outline" size={20} color={metaColor} />
      <Text style={[styles.goneText, { color: metaColor }]}>{label}</Text>
    </View>
  );

  if (kind === 'plate') {
    const order = orders.find((o) => o.id === attachmentId);
    if (!order) return missing('This plate is no longer available', POST_WIDTH);

    // The plate the sender was on, clamped — a post can lose plates after it
    // was shared.
    const plates = postMedia(order);
    const plate = plates[Math.min(attachmentIndex ?? 0, plates.length - 1)] ?? plates[0];
    const author = userFor(order.userId);
    const restaurant = restaurantFor(order.restaurantId);

    return (
      <View
        style={[
          styles.post,
          { width: POST_WIDTH, backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <View style={styles.postHeader}>
          <Avatar uri={author.avatar} size={26} />
          <Text style={[styles.postHandle, { color: colors.text }]} numberOfLines={1}>
            {author.handle}
          </Text>
          {author.verified && <Ionicons name="checkmark-circle" size={13} color={colors.accent} />}
        </View>

        <Image source={{ uri: plate.uri }} style={styles.postMedia} contentFit="cover" transition={150} />

        <View style={styles.postFooter}>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.postDish, { color: colors.text, fontFamily: displayFont }]}
              numberOfLines={1}>
              {plate.dishName || order.dishName}
            </Text>
            <Text style={[styles.postPlace, { color: colors.textMuted }]} numberOfLines={1}>
              {restaurant?.name ?? 'a restaurant'}
            </Text>
          </View>
          <RatingBadge score={plate.rating || order.rating} size="sm" />
        </View>
      </View>
    );
  }

  if (kind === 'plato') {
    const plato = platos.find((p) => p.id === attachmentId);
    if (!plato) return missing('This Plato is no longer available', PLATO_WIDTH);

    return (
      <View
        style={[
          styles.post,
          { width: PLATO_WIDTH, backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <View>
          <Image source={{ uri: plato.poster }} style={styles.platoPhoto} contentFit="cover" transition={150} />
          <View style={styles.platoPlayGlyph}>
            <Ionicons name="play" size={16} color="#fff" />
          </View>
          <View style={styles.platoViews}>
            <Ionicons name="eye" size={11} color="#fff" />
            <Text style={styles.platoViewsText}>{formatCount(plato.views)}</Text>
          </View>
          <View style={styles.platoBadge}>
            <RatingBadge score={plato.rating} size="sm" />
          </View>
        </View>
        <View style={styles.postFooter}>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.postDish, { color: colors.text, fontFamily: displayFont }]}
              numberOfLines={1}>
              {plato.dishName}
            </Text>
            <Text style={[styles.postPlace, { color: metaColor }]} numberOfLines={1}>
              {plato.restaurantName}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (kind === 'restaurant') {
    const restaurant = restaurantWithRating(attachmentId);
    if (!restaurant) return missing('This restaurant is no longer available', POST_WIDTH);

    return (
      <View
        style={[
          styles.post,
          { width: POST_WIDTH, backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Image source={{ uri: restaurant.image }} style={styles.postMedia} contentFit="cover" transition={150} />
        <View style={styles.postFooter}>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.postDish, { color: colors.text, fontFamily: displayFont }]}
              numberOfLines={1}>
              {restaurant.name}
            </Text>
            <Text style={[styles.postPlace, { color: metaColor }]} numberOfLines={1}>
              {restaurant.cuisine} · {restaurant.location}
            </Text>
            {/* Cached, not fetched live here — a chat bubble re-renders far
                more often than the restaurant page does, and Google's rating
                is already kept fresh there (0045). */}
            {restaurant.googleRating != null && (
              <View style={styles.googleRow}>
                <Image
                  source={require('../../assets/images/providers/google.png')}
                  style={styles.googleLogo}
                  contentFit="contain"
                />
                <Text style={[styles.googleText, { color: metaColor }]}>
                  {restaurant.googleRating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          <RatingBadge score={restaurant.platedRating} size="sm" />
        </View>
      </View>
    );
  }

  // A story reply quotes the story it answers. Stories expire, so this is the
  // one attachment that routinely resolves to nothing — and saying "that story
  // has expired" is the honest, useful version of that.
  return <StoryReplyCard storyId={attachmentId} onAccent={onAccent} />;
}

/**
 * A shared comment — the commenter's avatar and what they said, denormalized
 * onto the message itself (see 0070_comment_share.sql) rather than resolved
 * live. `author` still comes from `userFor`, live: profiles are globally
 * loaded already, and showing a stale name/avatar for a comment that's
 * otherwise still perfectly readable would be a strange inconsistency to
 * preserve on purpose.
 */
function SharedCommentCard({
  authorId,
  text,
  onAccent,
}: {
  authorId?: string;
  text?: string;
  onAccent?: boolean;
}) {
  const { colors } = useTheme();
  const { userFor } = useData();
  const author = authorId ? userFor(authorId) : undefined;

  const titleColor = onAccent ? colors.accentText : colors.text;
  const metaColor = onAccent ? 'rgba(255,255,255,0.78)' : colors.textMuted;
  const frame = [
    styles.storyReply,
    {
      backgroundColor: onAccent ? 'rgba(255,255,255,0.14)' : colors.surface,
      borderColor: onAccent ? 'rgba(255,255,255,0.22)' : colors.border,
    },
  ];

  return (
    <View style={frame}>
      {author ? (
        <Avatar uri={author.avatar} size={34} />
      ) : (
        <View style={[styles.storyGone, { backgroundColor: 'rgba(128,128,128,0.18)' }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={metaColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.storyTitle, { color: titleColor }]} numberOfLines={1}>
          {author ? `${author.name}'s comment` : 'A comment'}
        </Text>
        <Text style={[styles.storyMeta, { color: metaColor }]} numberOfLines={2}>
          {text || 'Tap to view'}
        </Text>
      </View>
    </View>
  );
}

function StoryReplyCard({ storyId, onAccent }: { storyId: string; onAccent?: boolean }) {
  const { colors } = useTheme();
  const { groups } = useStories();
  const { userFor } = useData();
  const story = groups.flatMap((g) => g.stories).find((s) => s.id === storyId);

  const titleColor = onAccent ? colors.accentText : colors.text;
  const metaColor = onAccent ? 'rgba(255,255,255,0.78)' : colors.textMuted;
  const frame = [
    styles.storyReply,
    {
      backgroundColor: onAccent ? 'rgba(255,255,255,0.14)' : colors.surface,
      borderColor: onAccent ? 'rgba(255,255,255,0.22)' : colors.border,
    },
  ];

  if (!story) {
    return (
      <View style={frame}>
        <View style={[styles.storyGone, { backgroundColor: 'rgba(128,128,128,0.18)' }]}>
          <Ionicons name="time-outline" size={16} color={metaColor} />
        </View>
        <Text style={[styles.storyMeta, { color: metaColor, flex: 1 }]}>That story has expired</Text>
      </View>
    );
  }

  return (
    <View style={frame}>
      <Image source={{ uri: story.mediaUrl }} style={styles.storyThumb} contentFit="cover" transition={150} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.storyTitle, { color: titleColor }]} numberOfLines={1}>
          Replied to @{userFor(story.userId).handle}
        </Text>
        <Text style={[styles.storyMeta, { color: metaColor }]} numberOfLines={1}>
          {story.caption || 'their story'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Shared plate → post card ──────────────────────────────────────────────
  post: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, paddingVertical: 8 },
  postHandle: { flexShrink: 1, fontSize: 13, fontWeight: '800' },
  postMedia: { width: '100%', aspectRatio: 1 },
  postFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9 },
  postDish: { fontSize: 15, letterSpacing: -0.2 },
  postPlace: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  googleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  googleLogo: { width: 11, height: 11 },
  googleText: { fontSize: 11, fontWeight: '700' },

  // ── Shared Plato → same tile PlatoTile renders in every grid ─────────────
  platoPhoto: { width: '100%', aspectRatio: 3 / 4 },
  platoPlayGlyph: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  platoViews: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  platoViewsText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  platoBadge: { position: 'absolute', right: 8, bottom: 8 },

  // ── Story reply ───────────────────────────────────────────────────────────
  storyReply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    width: 232,
  },
  storyThumb: { width: 40, height: 40, borderRadius: radius.sm },
  storyGone: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  storyTitle: { fontSize: 13, fontWeight: '700' },
  storyMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  gone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 26,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  goneText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
