import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { tick } from '@/lib/haptics';
import { radius, spacing, THEMES } from '@/theme/palettes';
import { ThemeMode, useTheme } from '@/theme/ThemeContext';

const OPTIONS: {
  mode: ThemeMode;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { mode: 'light', label: 'Light', description: THEMES.saffron.description, icon: 'sunny' },
  { mode: 'dark', label: 'Dark', description: THEMES.noir.description, icon: 'moon' },
  {
    mode: 'auto',
    label: 'Automatic',
    description: 'Follows your phone — switches with its light/dark setting',
    icon: 'contrast',
  },
];

export default function ThemePicker() {
  const { colors, mode, setMode, themeName } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Appearance" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          Pick how Plated looks — it applies instantly and is remembered next time you open the app.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {OPTIONS.map((opt, i) => {
            const selected = opt.mode === mode;
            return (
              <Pressable
                key={opt.mode}
                onPress={() => {
                  tick();
                  setMode(opt.mode);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.row,
                  i < OPTIONS.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                  { opacity: pressed ? 0.7 : 1 },
                ]}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: selected ? colors.accent : colors.surface },
                  ]}>
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={selected ? colors.accentText : colors.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.text }]}>{opt.label}</Text>
                  <Text style={[styles.description, { color: colors.textMuted }]}>
                    {/* Say which way Automatic is currently leaning — otherwise the row
                        gives no clue what it resolved to. */}
                    {opt.mode === 'auto' && selected
                      ? `Following your phone — ${themeName === 'noir' ? 'dark' : 'light'} right now`
                      : opt.description}
                  </Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: spacing.lg },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 15, fontWeight: '800' },
  description: { fontSize: 13, fontWeight: '500', marginTop: 2, lineHeight: 17 },
});
