import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Long-press menu for a comment on a plate or a Plato — one grouped card
 * sliding up from the bottom, iOS-action-sheet style.
 *
 * What's on it depends on whose comment it is: your own offers Delete (the
 * comment's own row-level policy is what actually restricts this to your
 * comments, same as everywhere else in this codebase that deletes something
 * "yours"); someone else's offers Share (send the comment itself into a
 * conversation as a card) and Report.
 *
 * A plain absolutely-positioned overlay, not its own `Modal` — every call
 * site opens this from inside a comments sheet that's already a `Modal`
 * (PlateCommentsSheet/PlatoCommentsSheet), and two sibling `Modal`s both
 * visible at once don't reliably route touches to the top one on iOS (each
 * `Modal` mounts into its own native window; the second one competing with
 * the first mid-animation is exactly the failure mode SendToSheet's own
 * onExternalShare works around for the system share sheet). Living in the
 * same window as its parent sidesteps that instead of timing around it.
 */
export function CommentActionsSheet({
  visible,
  onClose,
  mine,
  onDelete,
  onShare,
  onReport,
}: {
  visible: boolean;
  onClose: () => void;
  mine: boolean;
  onDelete?: () => void;
  onShare?: () => void;
  onReport?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const act = (fn?: () => void) => {
    onClose();
    fn?.();
  };

  return (
    <Animated.View entering={FadeIn.duration(120)} style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.wrap, { paddingBottom: insets.bottom + 12 }]}>
          <Animated.View entering={FadeInDown.duration(150)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {mine ? (
                  <Row icon="trash-outline" label="Delete" destructive onPress={() => act(onDelete)} last />
                ) : (
                  <>
                    <Row icon="arrow-redo-outline" label="Share" onPress={() => act(onShare)} />
                    <Row icon="flag-outline" label="Report" destructive onPress={() => act(onReport)} last />
                  </>
                )}
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
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
  overlay: StyleSheet.absoluteFill,
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 15 },
  rowLabel: { fontSize: 16, fontWeight: '700' },
});
