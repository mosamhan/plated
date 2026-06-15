import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

interface Props {
  value: number | string;
  label: string;
  onPress?: () => void;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

export function StatPill({ value, label, onPress }: Props) {
  const { colors } = useTheme();
  const display = typeof value === 'number' ? formatCount(value) : value;
  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <Text style={[styles.value, { color: colors.text }]}>{display}</Text>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1 },
  value: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});
