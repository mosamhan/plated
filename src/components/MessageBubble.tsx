import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, StyleProp, Text, View, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Avatar } from '@/components/Avatar';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { PhotoAlbumCarousel } from '@/components/PhotoAlbumCarousel';
import { SharedItemCard, sharedItemHref } from '@/components/SharedItemCard';
import { VoiceNote } from '@/components/VoiceNote';
import { ZoomableImage } from '@/components/ZoomableImage';
import { HEART_EMOJI, Message } from '@/data/messages';
import { isBigEmojiMessage } from '@/lib/emoji';
import { tapLight, tapMedium } from '@/lib/haptics';
import { extractFirstUrl, useLinkPreview } from '@/lib/linkPreview';
import { resolveQuote } from '@/lib/quotePreview';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { usePlatos } from '@/store/PlatosContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const DOUBLE_TAP_MS = 260;
// Rubber-band the drag past this point rather than following the finger
// 1:1 — the same "still moves, just slower" feedback iMessage/WhatsApp give
// once you've clearly dragged far enough to commit.
const REPLY_MAX = 76;
// How far a swipe has to travel before release commits to replying, instead
// of just springing back.
const REPLY_TRIGGER = 52;

const MENTION = /(@[a-zA-Z0-9_.]{2,30})/g;

/**
 * Splits a message's text on `@handle` tokens, styling each one — purely
 * presentational (no check against who's actually in the thread; the
 * composer's own autocomplete is what keeps a real mention accurate, this
 * just has to render whatever text comes back the same way on every device).
 *
 * On a received (surface-colored) bubble, the accent color reads clearly
 * against it. On your own bubble, the bubble *is* the accent color, so the
 * same tint would vanish into the background — underline instead, same as
 * how a mine-colored link would have to be told apart from its surroundings.
 */
function renderWithMentions(text: string, mine: boolean, accentColor: string) {
  const parts = text.split(MENTION);
  if (parts.length === 1) return text;
  const mentionStyle = mine
    ? { fontWeight: '800' as const, textDecorationLine: 'underline' as const }
    : { fontWeight: '800' as const, color: accentColor };
  return parts.map((part, i) => (part.startsWith('@') ? <Text key={i} style={mentionStyle}>{part}</Text> : part));
}

/** Where a message sits on screen, in window coordinates. */
export interface MessageAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Right-aligned (your own) vs left-aligned (theirs). */
  mine: boolean;
}

/**
 * One message in a thread.
 *
 * Your own messages sit right on the accent; everyone else's sit left on a
 * surface bubble. In a group the sender's avatar and name appear only on the
 * first message of a run — repeating them on every line turns a conversation
 * into a list of announcements.
 *
 * A shared plate or Plato is drawn *bare*, with no bubble behind it: the card
 * is already a self-contained object, and wrapping it in a coloured pill just
 * adds a frame around a frame. Any accompanying text still gets its own bubble
 * underneath, so the caption reads as something the sender said.
 *
 * Reactions: double-tap hearts it, long-press opens the quick-emoji bar. Both
 * are toggles — tapping the emoji you already picked takes it back.
 */
export function MessageBubble({
  message,
  mine,
  /** Groups need to say who's talking; a 1:1 thread obviously doesn't — this still only controls the name label. */
  showAuthor,
  /**
   * Shows the *sender's* avatar next to a message received from them, on the
   * leading message of a run — independent of `showAuthor`, which stays
   * group-only for the name label. A 1:1 thread doesn't need the label (you
   * know who you're talking to), but the avatar filling the previously-empty
   * gutter is worth showing there too.
   */
  showSenderAvatar,
  onRetry,
  onLongPress,
  onOpenPhoto,
  onOpenVideo,
  onJumpToReply,
  onSwipeReply,
  /**
   * Hides this bubble's content (opacity 0, not unmounted — the row keeps
   * its layout space so nothing else in the list shifts) while its floating
   * duplicate is shown in the long-press action sheet. See
   * MessageBubbleContent below.
   */
  hidden,
  /** Briefly true right after a reply-quote tap scrolls back to this message. */
  highlighted,
}: {
  message: Message;
  mine: boolean;
  showAuthor?: boolean;
  showSenderAvatar?: boolean;
  onRetry?: () => void;
  /**
   * Opens the actions menu — owned by the thread, which knows the whole list.
   * The frame is the message's position on screen, so the menu can sit against
   * it (bar above, actions below) instead of floating in the middle. For an
   * album, `photoIndex` is the page that was on screen at press time — what
   * a Reply from here should point at.
   */
  onLongPress?: (message: Message, anchor: MessageAnchor, photoIndex?: number) => void;
  /** Opens the full-screen photo viewer, on whichever album page is showing. */
  onOpenPhoto?: (message: Message, index: number) => void;
  /** Opens the full-screen video viewer — a video message is always one clip. */
  onOpenVideo?: (message: Message) => void;
  /** Tapping this message's reply-quote strip — scrolls the thread to whatever it answers. */
  onJumpToReply?: (messageId: string) => void;
  /**
   * Swipe-to-reply, like every other social/messaging app: drag a received
   * message right, or your own message left, past a threshold and release.
   */
  onSwipeReply?: (message: Message) => void;
  hidden?: boolean;
  highlighted?: boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userFor } = useData();
  const { reactionsFor, react } = useMessages();
  const sender = userFor(message.senderId);
  const lastTap = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<View>(null);
  // Which album page is currently showing — read (not reacted to) at tap
  // time, so swiping a carousel doesn't need to re-render this component.
  const albumIndex = useRef(0);

  const isImage = message.kind === 'image';
  const isVideo = message.kind === 'video';
  const imageUris = isImage
    ? message.attachmentIds?.length
      ? message.attachmentIds
      : message.attachmentId
        ? [message.attachmentId]
        : []
    : [];
  const href = sharedItemHref(message.kind, message.attachmentId, message.commentPostId);

  const reactions = reactionsFor(message.id);

  // Reacting to a message that hasn't landed yet would key the reaction to a
  // temporary id the server never sees.
  const canReact = !message.pending && !message.failed;

  // A pending open must never fire after unmount (stale navigation).
  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current);
  }, []);

  // Single tap opens a shared card; double tap hearts. The timer is what tells
  // them apart — without it the first tap of a double-tap would have already
  // navigated away from the message being reacted to.
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (openTimer.current) clearTimeout(openTimer.current);
      if (!canReact) return;
      tapLight();
      react(message.id, HEART_EMOJI);
      return;
    }
    lastTap.current = now;
    if (isImage && imageUris.length > 0) {
      if (openTimer.current) clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => {
        openTimer.current = null;
        lastTap.current = 0;
        onOpenPhoto?.(message, albumIndex.current);
      }, DOUBLE_TAP_MS);
      return;
    }
    if (isVideo && message.attachmentId) {
      if (openTimer.current) clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => {
        openTimer.current = null;
        lastTap.current = 0;
        onOpenVideo?.(message);
      }, DOUBLE_TAP_MS);
      return;
    }
    if (!href) return;
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      lastTap.current = 0;
      router.push(href);
    }, DOUBLE_TAP_MS);
  };

  const openActions = () => {
    if (!canReact) return;
    tapMedium();
    // Measured at press time rather than on layout: the list scrolls, so a
    // frame captured earlier would place the menu against where the message
    // used to be.
    bodyRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress?.(
        message,
        { x, y, width, height, mine },
        isImage && imageUris.length > 1 ? albumIndex.current : undefined,
      );
    });
  };

  // Received messages drag right, sent messages drag left — always away
  // from the edge the bubble already sits against, toward the middle of
  // the screen, the same direction WhatsApp/Telegram/Instagram all use.
  const dragX = useSharedValue(0);
  const crossed = useSharedValue(false);
  const commitReply = () => {
    if (message.pending || message.failed) return;
    onSwipeReply?.(message);
  };
  const swipe = Gesture.Pan()
    .enabled(!!onSwipeReply && canReact)
    .activeOffsetX(mine ? -10 : 10)
    .failOffsetX(mine ? 10 : -10)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const raw = mine ? Math.min(0, e.translationX) : Math.max(0, e.translationX);
      const magnitude = Math.abs(raw);
      const eased = magnitude <= REPLY_MAX ? magnitude : REPLY_MAX + (magnitude - REPLY_MAX) * 0.25;
      dragX.value = mine ? -eased : eased;
      const nowCrossed = eased > REPLY_TRIGGER;
      if (nowCrossed !== crossed.value) {
        crossed.value = nowCrossed;
        if (nowCrossed) runOnJS(tapLight)();
      }
    })
    .onEnd(() => {
      if (crossed.value) runOnJS(commitReply)();
      crossed.value = false;
      dragX.value = withSpring(0, { damping: 18, stiffness: 180 });
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }] }));
  const replyIconStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(dragX.value) / REPLY_TRIGGER);
    return { opacity: progress, transform: [{ scale: 0.5 + 0.5 * progress }] };
  });

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {!mine && <View style={styles.gutter}>{showSenderAvatar && <Avatar uri={sender.avatar} size={28} />}</View>}

      <View style={[styles.stack, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
        {!mine && showAuthor && (
          <Text style={[styles.author, { color: colors.textMuted }]} numberOfLines={1}>
            {sender.name}
          </Text>
        )}

        <View style={styles.swipeWrap}>
          {onSwipeReply && (
            <Animated.View
              pointerEvents="none"
              style={[styles.replyIconWrap, mine ? { right: 2 } : { left: 2 }, replyIconStyle]}>
              <View style={[styles.replyIconCircle, { backgroundColor: colors.surface }]}>
                <Ionicons name="arrow-undo-outline" size={15} color={colors.textMuted} />
              </View>
            </Animated.View>
          )}
          <GestureDetector gesture={swipe}>
            <Animated.View style={dragStyle}>
              <Pressable
                ref={bodyRef}
                onPress={onTap}
                onLongPress={openActions}
                delayLongPress={280}
                style={[
                  mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' },
                  message.pending && { opacity: 0.6 },
                  // Room for the reaction pill to hang off the bottom edge without
                  // colliding with the next message.
                  reactions.length > 0 && { marginBottom: 16 },
                  // The floating duplicate in the long-press menu takes over —
                  // opacity, not unmount, so the row keeps its layout space and
                  // nothing else in the list shifts while the menu is open.
                  hidden && { opacity: 0 },
                ]}>
                {highlighted && (
                  <Animated.View
                    pointerEvents="none"
                    entering={FadeIn.duration(150)}
                    exiting={FadeOut.duration(400)}
                    style={[styles.highlight, { backgroundColor: colors.accentSoft }]}
                  />
                )}
                <MessageBubbleContent
                  message={message}
                  mine={mine}
                  onAlbumIndexChange={(i) => {
                    albumIndex.current = i;
                  }}
                  onJumpTo={onJumpToReply}
                />
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </View>

        {message.failed && (
          <Pressable onPress={onRetry} hitSlop={8} style={styles.retry}>
            <Ionicons name="refresh" size={12} color={colors.ratingLow} />
            <Text style={[styles.retryText, { color: colors.ratingLow }]}>Not sent — tap to retry</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * The visual content of a bubble — reply-quote strip, the voice/image/
 * attachment/text bubble itself, the reaction pill — with none of the
 * interaction (`MessageBubble` owns tap/long-press/pending-opacity/list
 * spacing). Split out so the exact same visual, not a hand-copied twin of
 * it, can be duplicated into the long-press action sheet's floating
 * preview (`MessageActionsSheet.tsx`) — any drift between the real bubble
 * and that preview would be its own bug to chase.
 */
export function MessageBubbleContent({
  message,
  mine,
  onAlbumIndexChange,
  onJumpTo,
}: {
  message: Message;
  mine: boolean;
  /** Which album page is on screen — ignored by the static floating preview. */
  onAlbumIndexChange?: (index: number) => void;
  /** Tap on the reply-quote strip — ignored by the static floating preview. */
  onJumpTo?: (messageId: string) => void;
}) {
  const { colors } = useTheme();
  const { reactionsFor, messageById, bubbleColorFor } = useMessages();
  const { orders, restaurantFor } = useData();
  const { platos } = usePlatos();

  const isVoice = message.kind === 'voice';
  const isImage = message.kind === 'image';
  const isVideo = message.kind === 'video';
  const imageUris = isImage
    ? message.attachmentIds?.length
      ? message.attachmentIds
      : message.attachmentId
        ? [message.attachmentId]
        : []
    : [];
  const hasAttachment = message.kind !== 'text' && !isVoice && !isImage && !isVideo && !!message.attachmentId;
  // A per-chat "Chat bubble" color override — only ever applies to bubbles
  // *you* sent, and only in this one conversation (self-scoped, like
  // muted/pinned) — falls back to the theme's own accent when unset.
  const myBubbleColor = mine ? (bubbleColorFor(message.conversationId) ?? colors.accent) : undefined;
  const hasText = message.text.trim().length > 0;
  // A caption on a shared plate/photo stays normal size — only a message
  // that's *nothing but* a couple of emoji gets the oversized, bubble-free
  // treatment (iMessage/Instagram convention).
  const bigEmoji = message.kind === 'text' && isBigEmojiMessage(message.text);
  const linkUrl = message.kind === 'text' && !bigEmoji ? extractFirstUrl(message.text) : null;
  const linkPreview = useLinkPreview(linkUrl);
  const quoted = message.replyTo ? messageById(message.replyTo) : undefined;
  const quotePreview = quoted ? resolveQuote(quoted, message.replyToIndex, orders, platos, restaurantFor) : undefined;
  const reactions = reactionsFor(message.id);

  return (
    <>
      {quoted && quotePreview && (
        <Pressable
          onPress={() => onJumpTo?.(quoted.id)}
          disabled={!onJumpTo}
          style={({ pressed }) => [
            styles.quote,
            {
              backgroundColor: colors.surface,
              borderLeftColor: colors.accent,
              borderColor: colors.border,
              opacity: pressed ? 0.6 : 1,
            },
          ]}>
          {quotePreview.thumbnail ? (
            <Image source={{ uri: quotePreview.thumbnail }} style={styles.quoteThumb} contentFit="cover" />
          ) : (
            quotePreview.icon && (
              <View style={[styles.quoteThumb, styles.quoteIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name={quotePreview.icon} size={16} color={colors.accent} />
              </View>
            )
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.quoteWho, { color: colors.accent }]} numberOfLines={1}>
              {quoted.senderId === message.senderId ? 'Replying to themselves' : 'Reply'}
            </Text>
            <Text style={[styles.quoteText, { color: colors.textMuted }]} numberOfLines={2}>
              {quotePreview.text}
            </Text>
          </View>
        </Pressable>
      )}

      {isVoice && !!message.attachmentId && (
        <View
          style={[
            styles.bubble,
            styles.voiceBubble,
            mine
              ? { backgroundColor: myBubbleColor, borderBottomRightRadius: 6 }
              : {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderBottomLeftRadius: 6,
                },
          ]}>
          <VoiceNote uri={message.attachmentId} durationMs={message.durationMs} seed={message.id} onAccent={mine} />
        </View>
      )}

      {isImage && imageUris.length === 1 && (
        <ZoomableImage uri={imageUris[0]} style={styles.image} contentFit="cover" transition={150} />
      )}
      {isImage && imageUris.length > 1 && (
        <PhotoAlbumCarousel uris={imageUris} style={styles.image} onIndexChange={onAlbumIndexChange} />
      )}

      {isVideo && !!message.attachmentId && (
        <VideoBubbleThumb uri={message.attachmentId} style={styles.image} />
      )}

      {hasAttachment && (
        <SharedItemCard
          kind={message.kind}
          attachmentId={message.attachmentId}
          attachmentIndex={message.attachmentIndex}
          commentAuthorId={message.commentAuthorId}
          commentText={message.commentText}
        />
      )}

      {hasText && bigEmoji && (
        <Text style={styles.bigEmoji}>{message.text.trim()}</Text>
      )}

      {hasText && !bigEmoji && (
        <View
          style={[
            styles.bubble,
            hasAttachment && { marginTop: 4 },
            mine
              ? { backgroundColor: myBubbleColor, borderBottomRightRadius: 6 }
              : {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderBottomLeftRadius: 6,
                },
            // A failed message shouldn't keep wearing the confident accent.
            message.failed && { backgroundColor: colors.card, borderColor: colors.ratingLow, borderWidth: 1 },
          ]}>
          <Text style={[styles.text, { color: mine && !message.failed ? colors.accentText : colors.text }]}>
            {renderWithMentions(message.text, mine, colors.accent)}
          </Text>
        </View>
      )}

      {hasText && !!message.editedAt && (
        <Text style={[styles.edited, { color: colors.textMuted }]}>Edited</Text>
      )}

      {linkPreview && <LinkPreviewCard preview={linkPreview} />}

      {reactions.length > 0 && (
        <Animated.View
          entering={FadeIn.duration(120)}
          style={[
            styles.reactions,
            { backgroundColor: colors.card, borderColor: colors.border },
            mine ? { right: 8 } : { left: 8 },
          ]}>
          {[...new Set(reactions.map((r) => r.emoji))].slice(0, 3).map((e) => (
            <Text key={e} style={styles.reactionEmoji}>
              {e}
            </Text>
          ))}
          {reactions.length > 1 && (
            <Text style={[styles.reactionCount, { color: colors.textMuted }]}>{reactions.length}</Text>
          )}
        </Animated.View>
      )}
    </>
  );
}

/**
 * A video bubble's paused first-frame preview + play glyph — there's no
 * poster-frame pipeline (no server-side thumbnail generation for chat
 * videos), so this is a real, paused `VideoView` rather than a still image.
 * Muted so a thread full of paused clips never plays audio; tapping the
 * bubble (handled by the parent `Pressable`, not this component) is what
 * actually opens `VideoViewerSheet` to watch it with sound.
 */
function VideoBubbleThumb({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
  });
  return (
    <View style={style}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <View style={styles.videoPlayOverlay} pointerEvents="none">
        <Ionicons name="play" size={22} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6, paddingHorizontal: 12 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  // Reserved even when no avatar is drawn, so a run of messages stays aligned.
  gutter: { width: 28 },
  stack: { maxWidth: '86%' },
  author: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 4 },
  // Establishes the fixed (untransformed) box the reply icon anchors
  // against — the Animated.View inside only moves visually (transform),
  // so this box's layout never actually changes size or position.
  swipeWrap: { position: 'relative' },
  replyIconWrap: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  replyIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigEmoji: { fontSize: 52, lineHeight: 60 },
  edited: { fontSize: 10, fontWeight: '600', marginTop: 2, marginHorizontal: 4 },
  bubble: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.lg },
  voiceBubble: { paddingHorizontal: 12, paddingVertical: 10, minWidth: 232 },
  image: { width: 220, height: 220, borderRadius: radius.lg, overflow: 'hidden' },
  videoPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  quote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // A definite width, not a maxWidth: the text column below is `flex: 1`,
    // which contributes nothing to intrinsic size on its own — without a
    // definite width on the row itself that flex basis has nothing to
    // resolve against, and the text collapses instead of wrapping (see
    // SharedItemCard's own note on the exact same trap).
    width: 220,
    borderLeftWidth: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.sm,
    borderBottomLeftRadius: radius.sm,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 3,
  },
  quoteThumb: { width: 40, height: 40, borderRadius: radius.sm },
  quoteIcon: { alignItems: 'center', justifyContent: 'center' },
  quoteWho: { fontSize: 11, fontWeight: '800' },
  quoteText: { fontSize: 12, fontWeight: '500', marginTop: 1, lineHeight: 16 },
  highlight: { position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: radius.lg },
  text: { fontSize: 15, fontWeight: '500', lineHeight: 20 },
  reactions: {
    position: 'absolute',
    bottom: -13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 10, fontWeight: '800', marginLeft: 1 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 4 },
  retryText: { fontSize: 11, fontWeight: '700' },
});
