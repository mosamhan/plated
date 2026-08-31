import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsSection, SettingsToggle } from '@/components/SettingsKit';
import { useSettings } from '@/store/SettingsContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function AccessibilitySettings() {
  const { colors } = useTheme();
  const { settings, update } = useSettings();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Accessibility" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection
          footer="Plated also follows your device's own Reduce Motion and text size settings. This is an additional switch for when you want the app calmer than the system.">
          <SettingsToggle
            label="Reduce motion"
            description="Turn off the press animations, card transitions and heart bursts."
            value={settings.reduceMotion}
            onValueChange={(v) => update('reduceMotion', v)}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
