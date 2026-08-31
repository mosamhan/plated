import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsSection, SettingsToggle } from '@/components/SettingsKit';
import { useActivity } from '@/store/ActivityContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function ActivitySettings() {
  const { colors } = useTheme();
  const { showActivity, setShowActivity } = useActivity();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Activity status" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection
          footer="Turning this off also hides everyone else's activity from you — the setting works both ways, so it can't be used to watch people while staying invisible yourself.">
          <SettingsToggle
            label="Show activity status"
            description="Let people you message and follow see when you were last on Plated."
            value={showActivity}
            onValueChange={setShowActivity}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
