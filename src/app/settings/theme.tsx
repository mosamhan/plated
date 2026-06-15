import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ThemePreviewCard } from '@/components/ThemePreviewCard';
import { tick } from '@/lib/haptics';
import { spacing, THEME_ORDER, THEMES } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function ThemePicker() {
  const { colors, themeName, setTheme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Appearance" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          Pick a theme — it applies instantly across the whole app and is remembered next time you
          open Plated.
        </Text>
        {THEME_ORDER.map((name) => (
          <ThemePreviewCard
            key={name}
            theme={THEMES[name]}
            selected={name === themeName}
            onPress={() => {
              tick();
              setTheme(name);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: spacing.lg },
});
