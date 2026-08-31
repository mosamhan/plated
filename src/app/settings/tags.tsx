import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsChoice, SettingsSection } from '@/components/SettingsKit';
import { Audience, useSettings } from '@/store/SettingsContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function TagSettings() {
  const { colors } = useTheme();
  const { settings, update } = useSettings();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Tags and mentions" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection
          title="Who can tag or mention you"
          footer="This also covers being added as a co-creator on someone's post — an invite you haven't accepted is never shown to anyone else.">
          <SettingsChoice<Audience>
            value={settings.tagAudience}
            onChange={(v) => update('tagAudience', v)}
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'followers', label: 'People who follow you' },
              { value: 'friends', label: 'Followers you follow back' },
              { value: 'off', label: 'No one' },
            ]}
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
