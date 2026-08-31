import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsChoice, SettingsRow, SettingsSection } from '@/components/SettingsKit';
import { Audience, useSettings } from '@/store/SettingsContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

export default function CommentSettings() {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings, update, hiddenWords } = useSettings();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Comments" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection title="Who can comment" footer="Turning comments off applies to every plate and Plato. Individual posts can still be set to no comments when you create them.">
          <SettingsChoice<Audience>
            value={settings.commentAudience}
            onChange={(v) => update('commentAudience', v)}
            options={[
              { value: 'everyone', label: 'Everyone' },
              { value: 'followers', label: 'People who follow you' },
              { value: 'friends', label: 'Followers you follow back' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </SettingsSection>

        <SettingsSection title="Filtering">
          <SettingsRow
            label="Hidden words"
            value={`${hiddenWords.length}`}
            description="Comments containing these are hidden from your posts."
            onPress={() => router.push('/settings/hidden-words')}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
