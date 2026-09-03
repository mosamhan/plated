import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A fixed swatch list — this app's theming is two computed light/dark
 * palettes (`src/theme/palettes.ts`), not a named-accent set, so a per-chat
 * bubble color needs its own small standalone list rather than reusing
 * anything from the theme.
 */
const SWATCHES = [
  '#FF8A3D', // Saffron (matches the default accent, first so "no change" is obvious)
  '#FF5A5F',
  '#FF3B79',
  '#A855F7',
  '#5B6EF5',
  '#3DB2FF',
  '#2FBF71',
  '#FFC542',
] as const;

/**
 * "Chat bubble" — pick a color for your own outgoing bubbles in this one
 * conversation. Cloned from `EditGroupInfo.tsx`'s bottom-sheet shell.
 */
export function ChatBubbleColorSheet({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current?: string;
  /** `undefined` clears the override back to the theme's default accent. */
  onSelect: (color: string | undefined) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>Chat bubble</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Only changes how your own messages look to you in this chat.
          </Text>

          <View style={styles.grid}>
            {SWATCHES.map((color) => {
              const selected = current === color;
              return (
                <Pressable
                  key={color}
                  onPress={() => onSelect(color)}
                  style={[styles.swatch, { backgroundColor: color }]}>
                  {selected && <Ionicons name="checkmark" size={20} color="#fff" />}
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={() => onSelect(undefined)} style={styles.resetRow}>
            <Text style={[styles.resetText, { color: colors.accent }]}>Use theme default</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 6, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetRow: { alignItems: 'center', marginTop: 20 },
  resetText: { fontSize: 14, fontWeight: '700' },
});
