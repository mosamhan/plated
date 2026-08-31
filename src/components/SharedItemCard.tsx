import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { RatingBadge } from '@/components/RatingBadge';
import { MessageKind } from '@/data/messages';
import { postMedia } from '@/lib/post';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { useStories } from '@/store/StoriesContext';
import { displayFont } from '@/theme/fonts';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A shared plate or Plato inside a thread.
 *
 * Two presentations, because the two things are shaped differently and a share
 * should look like what it is:
 *
 *   * A **plate** renders as a post card — author header, then the photo, then
 *     the dish and its score. It's the feed card, shrunk.
 *   * A **Plato** renders as a **reel** — a tall 9:16 poster with a play button,
 *     the way a video announces itself as something to watch rather than read.
 *
 * Both are fixed-width on purpose. The card sits in a bubble that hugs its
 * content, and its text column is `flex: 1` — which contributes nothing to
 * intrinsic width — so without an explicit width the whole thing collapses to
 * the thumbnail and ellipsises everything else.
 */

const POST_WIDTH = 252;
const REEL_WIDTH = 208;

/**
 * Where a shared attachment leads. Returned rather than navigated internally so
 * the card can stay a plain View: the bubble owns every gesture on it (single
 * tap opens, double tap reacts, long press opens the emoji bar), and a nested
 * Pressable here would swallow the taps before the bubble ever saw them.
 */
export function sharedItemHref(kind: MessageKind, attachmentId?: string): string | null {
  if (!attachmentId) return null;
  if (kind === 'plate') return `/order/${attachmentId}`;
  if (kind === 'plato') return `/plato/${attachmentId}`;
  return null;
}

export function SharedItemCard({
  kind,
  attachmentId,
  /** Which plate of a multi-plate post was shared. Defaults to the first. */
  attachmentIndex,
  /** Tint for text drawn on the sender's own (accent) bubble. */
  onAccent,
}: {
  kind: MessageKind;
  attachmentId?: string;
  attachmentIndex?: number;
  onAccent?: boolean;
}) {
  const { colors } = useTheme();
  const { orders, restaurantFor, userFor } = useData();
  const { platos } = usePlatos();

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
    if (!plato) return missing('This Plato is no longer available', REEL_WIDTH);

    return (
      <View style={[styles.reel, { width: REEL_WIDTH }]}>
        <Image source={{ uri: plato.poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        {/* Scrims top and bottom so the label and the dish stay legible over
            whatever the poster frame happens to be. */}
        <View style={styles.reelTopScrim} />
        <View style={styles.reelBottomScrim} />

        <View style={styles.reelTop}>
          <Ionicons name="film-outline" size={13} color="#fff" />
          <Text style={styles.reelHandle} numberOfLines={1}>
            {plato.creatorHandle}
          </Text>
        </View>

        <View style={styles.reelPlay}>
          <Ionicons name="play" size={26} color="#fff" style={styles.reelPlayIcon} />
        </View>

        <View style={styles.reelBottom}>
          <Text style={styles.reelDish} numberOfLines={1}>
            {plato.dishName}
          </Text>
          <Text style={styles.reelPlace} numberOfLines={1}>
            {plato.restaurantName}
          </Text>
        </View>
      </View>
    );
  }

  // A story reply quotes the story it answers. Stories expire, so this is the
  // one attachment that routinely resolves to nothing — and saying "that story
  // has expired" is the honest, useful version of that.
  return <StoryReplyCard storyId={attachmentId} onAccent={onAccent} />;
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

  // ── Shared Plato → reel card ──────────────────────────────────────────────
  reel: {
    aspectRatio: 9 / 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  reelTopScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 64, backgroundColor: 'rgba(0,0,0,0.35)' },
  reelBottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 96, backgroundColor: 'rgba(0,0,0,0.45)' },
  reelTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  reelHandle: { flexShrink: 1, color: '#fff', fontSize: 12, fontWeight: '800' },
  reelPlay: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Nudged right so the triangle's mass reads as centred in the circle.
  reelPlayIcon: { marginLeft: 3 },
  reelBottom: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  reelDish: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  reelPlace: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', marginTop: 1 },

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
