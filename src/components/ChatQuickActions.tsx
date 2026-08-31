import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const MENU_WIDTH = 220;
const GAP = 6;
const EDGE = 12;
const ROW_HEIGHT = 48;

/** Where the long-pressed inbox row sits on screen — same idea as MessageAnchor. */
export interface RowAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The Instagram-style long-press menu on an inbox row: a small floating menu
 * anchored to the row itself, not a bottom sheet — cloned from
 * MessageActionsSheet's architecture (that's the app's only anchored/floating
 * menu precedent), simplified to one column of rows since there's no reaction
 * bar for a whole conversation the way there is for a single message.
 */
export function ChatQuickActions({
  visible,
  anchor,
  unread,
  pinned,
  muted,
  onClose,
  onMarkUnread,
  onTogglePin,
  onToggleMute,
  onDelete,
}: {
  visible: boolean;
  anchor: RowAnchor | null;
  unread: boolean;
  pinned: boolean;
  muted: boolean;
  onClose: () => void;
  onMarkUnread: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  if (!anchor) return null;

  const rowCount = 4;
  const menuHeight = rowCount * ROW_HEIGHT;
  const belowTop = anchor.y + anchor.height + GAP;
  const fitsBelow = belowTop + menuHeight <= screenH - insets.bottom - GAP;
  const top = fitsBelow ? belowTop : Math.max(insets.top + GAP, anchor.y - GAP - menuHeight);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          entering={FadeInDown.duration(150)}
          style={[
            styles.menu,
            { top, left: EDGE, backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Row
              icon={unread ? 'mail-open-outline' : 'mail-unread-outline'}
              label={unread ? 'Mark as read' : 'Mark as unread'}
              onPress={onMarkUnread}
            />
            <Row icon={pinned ? 'pin' : 'pin-outline'} label={pinned ? 'Unpin' : 'Pin'} onPress={onTogglePin} />
            <Row
              icon={muted ? 'notifications-outline' : 'notifications-off-outline'}
              label={muted ? 'Unmute' : 'Mute'}
              onPress={onToggleMute}
            />
            <Row icon="trash-outline" label="Delete" destructive onPress={onDelete} last />
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
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, height: 48 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
});
