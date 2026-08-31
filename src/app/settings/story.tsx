import { ScrollView, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsChoice, SettingsSection, SettingsToggle } from '@/components/SettingsKit';
import { StoryReplyAudience, StoryShareAudience, useSettings } from '@/store/SettingsContext';
import { spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** Everything about how your own stories behave, in one place. */
export default function StorySettings() {
  const { colors } = useTheme();
  const { settings, update } = useSettings();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Story" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection title="Viewing" footer="Close friends is a separate, private list — the people on it are never told they're on it.">
          <SettingsChoice<StoryShareAudience>
            value={settings.storyShareAudience}
            onChange={(v) => update('storyShareAudience', v)}
            options={[
              { value: 'public', label: 'Everyone', description: 'Anyone on Plated can see your stories.' },
              { value: 'friends', label: 'Friends', description: 'Only people you follow who follow you back.' },
              { value: 'close', label: 'Close friends only', description: 'Just the people on your close friends list.' },
            ]}
          />
        </SettingsSection>

        <SettingsSection title="Replying" footer="Replies arrive as a direct message, so your Messages setting applies too — whichever is stricter wins.">
          <SettingsChoice<StoryReplyAudience>
            value={settings.storyReplyAudience}
            onChange={(v) => update('storyReplyAudience', v)}
            options={[
              { value: 'followers', label: 'Your followers' },
              { value: 'friends', label: 'Followers you follow back' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </SettingsSection>

        <SettingsSection title="Saving and sharing">
          <SettingsToggle
            label="Save story to archive"
            description="Keep your stories after they expire so only you can look back at them."
            value={settings.saveStoryToArchive}
            onValueChange={(v) => update('saveStoryToArchive', v)}
          />
          <SettingsToggle
            label="Allow sharing to messages"
            description="Let people send your story to someone else in a direct message."
            value={settings.allowStoryResharing}
            onValueChange={(v) => update('allowStoryResharing', v)}
            last
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}
