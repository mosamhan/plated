import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What we collect',
    body: 'Account info (name, email, username), the content you post (photos, ratings, comments), your follows and likes, and basic usage data. If you enable contact sync, contacts are matched on-device and hashed before any lookup. Location is used only to show nearby plates and is never sold.',
  },
  {
    title: 'How we use it',
    body: 'To run the feed, leaderboards, and recommendations; to attribute orders to creators (order hand-offs carry an anonymous session ID, never your identity); and to keep the community safe. We do not sell personal data.',
  },
  {
    title: 'Ordering hand-offs',
    body: 'When you tap a provider (DoorDash, Uber Eats), you leave Plated and that provider’s privacy policy applies. Plated receives only anonymous confirmation that an attributed order completed — not your address, payment details, or order contents.',
  },
  {
    title: 'Your controls',
    body: 'Edit or delete any of your content. Block users and report content from anywhere in the app. Delete your account (Settings → Account → Delete account) and all associated data is removed within 30 days. Data export available on request: privacy@plated.app.',
  },
  {
    title: 'Children',
    body: 'Plated is not directed at children under 13 and we do not knowingly collect data from them. Suspected underage accounts are removed.',
  },
];

export default function Privacy() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Privacy Policy" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text style={[styles.updated, { color: colors.textMuted }]}>
          Working draft · last updated June 2026 · a public web copy is required for store submission
        </Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={{ marginTop: spacing.xl }}>
            <Text style={[typography.heading, { color: colors.text }]}>{s.title}</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  updated: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  body: { fontSize: 14, fontWeight: '500', lineHeight: 21, marginTop: 6 },
});
