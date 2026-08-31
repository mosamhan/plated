import { Linking, ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '@/components/SettingsKit';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/**
 * Device permissions live in iOS Settings, not here — an app can't grant itself
 * camera access. This screen exists so the answer to "why can't Plated see my
 * photos?" is one tap away instead of a hunt through the system settings app.
 */
export default function DevicePermissions() {
  const { colors } = useTheme();
  const open = () => Linking.openSettings().catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Device permissions" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection
          title="What Plated asks for"
          footer="These are granted by iOS, so changing them opens your device settings.">
          <SettingsRow icon="camera-outline" label="Camera" description="Taking a photo of a plate or recording a Plato." onPress={open} />
          <SettingsRow icon="images-outline" label="Photos" description="Picking plates from your library." onPress={open} />
          <SettingsRow icon="mic-outline" label="Microphone" description="Recording voice messages and Plato audio." onPress={open} />
          <SettingsRow icon="location-outline" label="Location" description="Finding restaurants near you on Discover." onPress={open} />
          <SettingsRow icon="notifications-outline" label="Notifications" description="Messages, reactions and streak reminders." onPress={open} last />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
