import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsSection, SettingsToggle } from '@/components/SettingsKit';
import { useSettings } from '@/store/SettingsContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Account privacy. A private account's plates and Platos are visible only to
 * followers you've accepted — the same `visibility` machinery posts already
 * use (0016/0017), applied at the account level rather than per post.
 */
export default function PrivacySettings() {
  const { colors } = useTheme();
  const { settings, update } = useSettings();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Account privacy" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection
          footer="When your account is private, only people you approve can see your plates, Platos and stories. Restaurants and ratings you've already contributed stay part of Plated's public averages — they just stop being attributed to you publicly.">
          <SettingsToggle
            label="Private account"
            value={settings.privateAccount}
            onValueChange={(v) => update('privateAccount', v)}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
