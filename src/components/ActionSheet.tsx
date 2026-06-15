import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export interface SheetAction {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: SheetAction[];
}

/**
 * Cross-platform action menu (bottom sheet). Used instead of multi-button
 * Alert.alert, which is a silent no-op on react-native-web.
 */
export function ActionSheet({ visible, onClose, title, actions }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          {title && (
            <Text style={[styles.title, { color: colors.textMuted }]} numberOfLines={1}>
              {title}
            </Text>
          )}
          <View style={{ gap: 8 }}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => {
                  onClose();
                  // Let the sheet dismiss before the action's own UI appears.
                  setTimeout(a.onPress, 120);
                }}
                style={({ pressed }) => [
                  styles.action,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
                ]}>
                {a.icon && (
                  <Ionicons name={a.icon} size={20} color={a.destructive ? colors.ratingLow : colors.text} />
                )}
                <Text style={[styles.actionText, { color: a.destructive ? colors.ratingLow : colors.text }]}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.action, { justifyContent: 'center', opacity: pressed ? 0.8 : 1 }]}>
              <Text style={[styles.actionText, { color: colors.textMuted, textAlign: 'center' }]}>Cancel</Text>
            </Pressable>
          </View>
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
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  actionText: { fontSize: 15, fontWeight: '700' },
});
