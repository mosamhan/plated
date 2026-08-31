import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tick } from '@/lib/haptics';
import { radius } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * A flat, equal-width segmented pill — the shared building block for the
 * Discover/Ranks switch, so it reads as one consistent control language.
 * No sliding highlight — the active segment just carries a flat fill.
 */
export function SegmentedPill<T extends string>({
  value,
  onChange,
  options,
  minWidth = 200,
  fontSize = 16,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { key: T; label: string }[];
  minWidth?: number;
  fontSize?: number;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.toggle, { backgroundColor: colors.surface, borderColor: colors.border, minWidth }]}>
      {options.map(({ key, label }) => {
        const on = value === key;
        return (
          <Pressable
            key={key}
            style={[styles.seg, on && { backgroundColor: colors.accent }]}
            onPress={() => {
              tick();
              onChange(key);
            }}>
            <Text style={[styles.segText, { fontSize, color: on ? colors.accentText : colors.textMuted }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    alignSelf: 'center',
  },
  seg: { flex: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  segText: { fontWeight: '700' },
});
