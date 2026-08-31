import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsSection, SettingsToggle } from '@/components/SettingsKit';
import { useSettings } from '@/store/SettingsContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function MediaQuality() {
  const { colors } = useTheme();
  const { settings, update } = useSettings();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Media quality" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection
          footer="A plate is worth looking at closely, so uploads are already good quality. Highest keeps more detail at the cost of a slower upload on a poor connection.">
          <SettingsToggle
            label="Upload at highest quality"
            description="Use more data to keep the most detail in your photos and clips."
            value={settings.uploadHd}
            onValueChange={(v) => update('uploadHd', v)}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
