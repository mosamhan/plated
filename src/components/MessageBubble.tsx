import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Avatar } from '@/components/Avatar';
import { SharedItemCard, sharedItemHref } from '@/components/SharedItemCard';
import { VoiceNote } from '@/components/VoiceNote';
import { ZoomableImage } from '@/components/ZoomableImage';
import { HEART_EMOJI, Message } from '@/data/messages';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { useMessages } from '@/store/MessagesContext';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const DOUBLE_TAP_MS = 260;

/** Where a message sits on screen, in window coordinates. */
export interface MessageAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Right-aligned (your own) vs left-aligned (theirs). */
  mine: boolean;
}

/** One line summarising the message a reply is answering. */
function quotedPreview(message: Message): string {
  if (message.kind === 'voice') return '🎙 Voice message';
  if (message.kind === 'plate') return '🍽 Shared a plate';
  if (message.kind === 'plato') return '🎬 Shared a Plato';
  if (message.kind === 'image') return '📷 Photo';
  return message.text;
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
  /** Groups need to say who's talking; a 1:1 thread obviously doesn't. */
  showAuthor,
  onRetry,
  onLongPress,
}: {
  message: Message;
  mine: boolean;
  showAuthor?: boolean;
  onRetry?: () => void;
  /**
   * Opens the actions menu — owned by the thread, which knows the whole list.
   * The frame is the message's position on screen, so the menu can sit against
   * it (bar above, actions below) instead of floating in the middle.
   */
  onLongPress?: (message: Message, anchor: MessageAnchor) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const { userFor } = useData();
  const { reactionsFor, react, messageById } = useMessages();
  const lastTap = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<View>(null);

  const sender = userFor(message.senderId);
  const isVoice = message.kind === 'voice';
  const isImage = message.kind === 'image';
  const hasAttachment = message.kind !== 'text' && !isVoice && !isImage && !!message.attachmentId;
  const hasText = message.text.trim().length > 0;
  const href = sharedItemHref(message.kind, message.attachmentId);
  const quoted = message.replyTo ? messageById(message.replyTo) : undefined;

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
      onLongPress?.(message, { x, y, width, height, mine });
    });
  };

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {!mine && <View style={styles.gutter}>{showAuthor && <Avatar uri={sender.avatar} size={28} />}</View>}

      <View style={[styles.stack, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
        {!mine && showAuthor && (
          <Text style={[styles.author, { color: colors.textMuted }]} numberOfLines={1}>
            {sender.name}
          </Text>
        )}

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
          ]}>
          {quoted && (
            <View
              style={[
                styles.quote,
                {
                  backgroundColor: colors.surface,
                  borderLeftColor: colors.accent,
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[styles.quoteWho, { color: colors.accent }]} numberOfLines={1}>
                {quoted.senderId === message.senderId ? 'Replying to themselves' : 'Reply'}
              </Text>
              <Text style={[styles.quoteText, { color: colors.textMuted }]} numberOfLines={2}>
                {quotedPreview(quoted)}
              </Text>
            </View>
          )}

          {isVoice && !!message.attachmentId && (
            <View
              style={[
                styles.bubble,
                styles.voiceBubble,
                mine
                  ? { backgroundColor: colors.accent, borderBottomRightRadius: 6 }
                  : {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderBottomLeftRadius: 6,
                    },
              ]}>
              <VoiceNote
                uri={message.attachmentId}
                durationMs={message.durationMs}
                seed={message.id}
                onAccent={mine}
              />
            </View>
          )}

          {isImage && !!message.attachmentId && (
            <ZoomableImage
              uri={message.attachmentId}
              style={styles.image}
              contentFit="cover"
              transition={150}
            />
          )}

          {hasAttachment && (
            <SharedItemCard
              kind={message.kind}
              attachmentId={message.attachmentId}
              attachmentIndex={message.attachmentIndex}
            />
          )}

          {hasText && (
            <View
              style={[
                styles.bubble,
                hasAttachment && { marginTop: 4 },
                mine
                  ? { backgroundColor: colors.accent, borderBottomRightRadius: 6 }
                  : {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderBottomLeftRadius: 6,
                    },
                // A failed message shouldn't keep wearing the confident accent.
                message.failed && { backgroundColor: colors.card, borderColor: colors.ratingLow, borderWidth: 1 },
              ]}>
              <Text
                style={[styles.text, { color: mine && !message.failed ? colors.accentText : colors.text }]}>
                {message.text}
              </Text>
            </View>
          )}

          {reactions.length > 0 && (
            <Animated.View
              entering={ZoomIn.springify().damping(13)}
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
        </Pressable>

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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 6, paddingHorizontal: 12 },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  // Reserved even when no avatar is drawn, so a run of messages stays aligned.
  gutter: { width: 28 },
  stack: { maxWidth: '86%' },
  author: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 4 },
  bubble: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.lg },
  voiceBubble: { paddingHorizontal: 12, paddingVertical: 10, minWidth: 232 },
  image: { width: 220, height: 220, borderRadius: radius.lg },
  quote: {
    maxWidth: 250,
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
  quoteWho: { fontSize: 11, fontWeight: '800' },
  quoteText: { fontSize: 12, fontWeight: '500', marginTop: 1, lineHeight: 16 },
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
