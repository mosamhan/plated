import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The row of labeled icon-circle quick actions under a conversation's
 * profile picture — View profile/Create group on a 1:1 (`chat-info`), Add
 * people/Invite link on a group (`group-info`). Different actions per
 * screen, but shared here so the two can't drift in how the row itself
 * looks.
 */
export function IconActionRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function IconAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <View style={[styles.circle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name={icon} size={20} color={colors.text} />
      </View>
      <Text style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  action: { alignItems: 'center', gap: 6, width: 72 },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
});
