import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsSection, SettingsToggle } from '@/components/SettingsKit';
import { useSettings } from '@/store/SettingsContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function SharingSettings() {
  const { colors } = useTheme();
  const { settings, update } = useSettings();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Sharing" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection
          footer="Turning this off removes the Send-to option from your plates for other people. Anyone can still copy a link — a public post is a public post.">
          <SettingsToggle
            label="Allow others to share your plates"
            description="Let people send your plates and Platos to someone in a message."
            value={settings.allowResharing}
            onValueChange={(v) => update('allowResharing', v)}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
