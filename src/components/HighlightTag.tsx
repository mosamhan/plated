import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { HIGHLIGHT_META, type PlateHighlight } from '@/lib/highlights';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * The "Top Rated" / "Most Reordered" badge on a Discover tile. Drawn on a
 * scrim rather than a theme surface because it sits over photography, where
 * a light chip would disappear against a bright plate.
 */
export function HighlightTag({ highlight }: { highlight: PlateHighlight }) {
  const { colors } = useTheme();
  const meta = HIGHLIGHT_META[highlight];
  return (
    <View style={styles.tag}>
      <Ionicons name={meta.icon} size={10} color={colors.accent} />
      <Text style={[styles.label, { color: colors.accent }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  label: { fontSize: 10, fontWeight: '800' },
});
