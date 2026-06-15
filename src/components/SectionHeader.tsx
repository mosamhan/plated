import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { spacing, typography } from '@/theme/palettes';

interface Props {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.heading, { color: colors.text }]}>{title}</Text>
        {subtitle && (
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
            {subtitle}
          </Text>
        )}
      </View>
      {actionLabel && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[typography.label, { color: colors.accent }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
});
