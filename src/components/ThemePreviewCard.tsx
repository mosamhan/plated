import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, ThemeMeta } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

interface Props {
  theme: ThemeMeta;
  selected: boolean;
  onPress: () => void;
}

export function ThemePreviewCard({ theme, selected, onPress }: Props) {
  const { colors: active } = useTheme();
  const p = theme.palette;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: p.background,
          borderColor: selected ? active.accent : p.border,
          borderWidth: selected ? 2.5 : StyleSheet.hairlineWidth,
        },
      ]}>
      {/* Mini mock of a feed card using the palette */}
      <View style={[styles.preview, { backgroundColor: p.card, borderColor: p.border }]}>
        <View style={styles.rowTop}>
          <View style={[styles.dot, { backgroundColor: p.accent }]} />
          <View style={{ flex: 1 }}>
            <View style={[styles.line, { backgroundColor: p.text, width: '55%' }]} />
            <View style={[styles.line, { backgroundColor: p.textMuted, width: '35%', marginTop: 4 }]} />
          </View>
          <View style={[styles.scoreChip, { backgroundColor: p.ratingHigh }]}>
            <Text style={styles.scoreText}>9.2</Text>
          </View>
        </View>
        <View style={[styles.swatches]}>
          <View style={[styles.swatch, { backgroundColor: p.accent }]} />
          <View style={[styles.swatch, { backgroundColor: p.accentSoft }]} />
          <View style={[styles.swatch, { backgroundColor: p.surface, borderColor: p.border, borderWidth: 1 }]} />
          <View style={[styles.swatch, { backgroundColor: p.ratingMid }]} />
        </View>
      </View>

      <View style={styles.meta}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: active.text }]}>{theme.label}</Text>
          <Text style={[styles.desc, { color: active.textMuted }]}>{theme.description}</Text>
        </View>
        {selected && <Ionicons name="checkmark-circle" size={24} color={active.accent} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 12, marginBottom: 14 },
  preview: { borderRadius: radius.md, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 30, height: 30, borderRadius: 15 },
  line: { height: 7, borderRadius: 4 },
  scoreChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  scoreText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  swatches: { flexDirection: 'row', gap: 8, marginTop: 14 },
  swatch: { flex: 1, height: 22, borderRadius: 7 },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingHorizontal: 4 },
  title: { fontSize: 16, fontWeight: '800' },
  desc: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
