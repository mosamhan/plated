import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';
import { contrastText, isTopRated, radius, ratingColor } from '@/theme/palettes';

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { box: 34, font: 13, pad: 4, flame: 10 },
  md: { box: 44, font: 16, pad: 6, flame: 12 },
  lg: { box: 60, font: 22, pad: 8, flame: 15 },
};

export function RatingBadge({ score, size = 'md' }: Props) {
  const { colors } = useTheme();
  const s = SIZES[size];
  const color = ratingColor(colors, score);
  // Rating colors vary per theme (Noir Gold runs brighter) — compute text color.
  const fg = contrastText(color);
  // Flame marks 9.0+ so the signal survives grayscale and colorblindness.
  const flame = isTopRated(score);
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: color,
          minWidth: s.box,
          paddingVertical: s.pad,
          paddingHorizontal: s.pad + 2,
          borderRadius: radius.md,
        },
      ]}>
      <View style={styles.row}>
        {flame && <Ionicons name="flame" size={s.flame} color={fg} style={{ marginRight: 2 }} />}
        <Text style={[styles.text, { fontSize: s.font, color: fg }]}>{score.toFixed(1)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { fontWeight: '800', letterSpacing: -0.3 },
});
