import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { radius, ratingColor } from '@/theme/palettes';

interface Props {
  value: number;
  onChange: (value: number) => void;
}

/** A 1–10 dish rating selector (the core Plated action). */
export function RatingInput({ value, onChange }: Props) {
  const { colors } = useTheme();
  const color = ratingColor(colors, value);
  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.big, { color }]}>{value.toFixed(1)}</Text>
        <Text style={[styles.outOf, { color: colors.textMuted }]}>/ 10</Text>
      </View>
      <View style={styles.segments}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const filled = n <= value;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              style={[
                styles.segment,
                {
                  backgroundColor: filled ? color : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>Tap to rate this plate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  big: { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  outOf: { fontSize: 18, fontWeight: '700', marginLeft: 6, marginBottom: 7 },
  segments: { flexDirection: 'row', gap: 5 },
  segment: {
    flex: 1,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hint: { fontSize: 12, fontWeight: '600', marginTop: 10 },
});
