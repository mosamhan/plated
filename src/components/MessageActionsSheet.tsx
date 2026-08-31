import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MessageAnchor } from '@/components/MessageBubble';
import { canUnsend, Message, QUICK_REACTIONS } from '@/data/messages';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const BAR_HEIGHT = 60;
const MENU_WIDTH = 232;
const GAP = 10;
/** Matches MessageBubble's row padding, so the bar lines up with the bubbles. */
const EDGE = 12;

/**
 * The long-press menu on a message: the quick-emoji bar, then the actions.
 *
 * What's on the menu depends on whose message it is, and — for your own — how
 * long ago you sent it:
 *
 *   * **Yours, within the unsend window:** Reply · Forward · Delete for me ·
 *     Unsend.
 *   * **Yours, after it:** the same minus Unsend. The window closing is the
 *     point — once it's had time to be read, taking it back isn't yours to do.
 *   * **Theirs:** Reply · Forward · Delete for me · Report. There is no unsend
 *     for someone else's message, here or in the database (0022).
 *
 * "Delete for me" is always available to everyone. It only ever hides your own
 * copy, which is why it needs no window and no permission.
 *
 * Both pieces are anchored to the message: the reaction bar sits directly above
 * it, the actions directly below, and both hug the side the bubble is on —
 * flush left for what you've received, pushed right for what you sent. A menu
 * floating in the centre of the screen makes you work out which message you're
 * about to delete; one attached to it doesn't.
 */
export function MessageActionsSheet({
  message,
  mine,
  anchor,
  currentEmoji,
  visible,
  onClose,
  onReact,
  onReply,
  onForward,
  onDeleteForMe,
  onUnsend,
  onReport,
}: {
  message: Message | null;
  mine: boolean;
  anchor: MessageAnchor | null;
  currentEmoji?: string;
  visible: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onDeleteForMe: () => void;
  onUnsend: () => void;
  onReport: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  if (!message || !anchor) return null;

  const unsendable = mine && canUnsend(message);

  // How many rows the menu will have, so its height can be reserved before it
  // renders and the whole stack can be nudged up if it would run off-screen.
  const rowCount = 3 + (unsendable ? 1 : 0) + (!mine ? 1 : 0);
  const menuHeight = rowCount * 48;

  const barTop = anchor.y - BAR_HEIGHT - GAP;
  const menuTop = anchor.y + anchor.height + GAP;
  // If the actions would spill past the bottom, slide the whole arrangement up
  // by however much it overflows rather than letting it hang off.
  const overflow = Math.max(0, menuTop + menuHeight - (screenH - insets.bottom - GAP));
  // ...and never push the bar under the status bar doing it.
  const lift = Math.min(overflow, Math.max(0, barTop - insets.top - GAP));

  const alignLeft = anchor.mine
    ? Math.max(EDGE, anchor.x + anchor.width - MENU_WIDTH)
    : Math.min(anchor.x, screenW - MENU_WIDTH - EDGE);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(120)}
          style={[
            styles.floating,
            {
              top: Math.max(insets.top + GAP, barTop - lift),
              // Hug the message's side. Received messages start at the same
              // left edge as their bubble; your own end at its right edge.
              ...(anchor.mine ? { right: EDGE } : { left: EDGE }),
            },
          ]}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.barRail}
              contentContainerStyle={[
                styles.bar,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              {QUICK_REACTIONS.map((emoji) => {
                const on = currentEmoji === emoji;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => onReact(emoji)}
                    style={({ pressed }) => [
                      styles.barItem,
                      on && { backgroundColor: colors.accentSoft },
                      { transform: [{ scale: pressed ? 1.25 : 1 }] },
                    ]}>
                    <Text style={styles.barEmoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(150)}
          style={[
            styles.menu,
            { top: menuTop - lift, left: alignLeft, backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Row icon="arrow-undo-outline" label="Reply" onPress={onReply} />
            <Row icon="arrow-redo-outline" label="Forward" onPress={onForward} />
            <Row icon="trash-outline" label="Delete for me" onPress={onDeleteForMe} />
            {unsendable && (
              <Row icon="close-circle-outline" label="Unsend" destructive onPress={onUnsend} />
            )}
            {!mine && <Row icon="flag-outline" label="Report" destructive onPress={onReport} last />}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const tint = destructive ? colors.ratingLow : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
        { opacity: pressed ? 0.6 : 1 },
      ]}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  // No opposite edge set, so the bar sizes to its content and stays pinned to
  // whichever side the anchor put it on.
  floating: { position: 'absolute', maxWidth: '94%' },
  // The bar scrolls: seven emoji at a comfortable tap size overflow a narrow
  // phone, and shrinking them to fit makes them harder to hit.
  barRail: { flexGrow: 0, maxWidth: '100%' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  barItem: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  barEmoji: { fontSize: 27 },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 14 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
});
