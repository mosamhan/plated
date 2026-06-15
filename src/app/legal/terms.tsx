import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { spacing, typography } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Community Guidelines',
    body: 'Plated is for sharing real plates you actually ate. Post your own photos, rate honestly, and be kind. We have zero tolerance for objectionable content: hate speech, harassment, threats, sexually explicit material, spam, or content that endangers anyone. Violations are removed and repeat offenders are permanently banned.',
  },
  {
    title: '2. Child safety',
    body: 'Plated strictly prohibits child sexual abuse and exploitation (CSAE) in any form. Such content is removed immediately, accounts are terminated, and reports are escalated to the National Center for Missing & Exploited Children (NCMEC) and law enforcement. Report concerns to safety@plated.app. Plated is for users 13 and older.',
  },
  {
    title: '3. Your content',
    body: 'You own the photos and reviews you post. By posting, you grant Plated a license to display them in the app and in previews of the app. You can delete your content, or your entire account, at any time.',
  },
  {
    title: '4. Honest ratings & creator earnings',
    body: 'Ratings must reflect your genuine opinion. Creators in the earnings program are paid for attributed orders regardless of the rating they give — never for positive reviews. Plates that carry commission are always labeled. Buying, selling, or trading ratings is prohibited.',
  },
  {
    title: '5. Ordering',
    body: 'Plated hands you off to third-party providers (DoorDash, Uber Eats, restaurants) to complete orders. The provider — not Plated — is responsible for the transaction, delivery, refunds, and food safety. Prices come from the provider and are the same whether or not you arrive via Plated.',
  },
  {
    title: '6. Moderation & enforcement',
    body: 'You can report any content or block any user from inside the app. Reports are reviewed within 24 hours. We may remove content or suspend accounts that violate these terms, with appeal available at support@plated.app.',
  },
];

export default function Terms() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Terms & Guidelines" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text style={[styles.updated, { color: colors.textMuted }]}>
          Working draft · last updated June 2026
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
  updated: { fontSize: 12, fontWeight: '600' },
  body: { fontSize: 14, fontWeight: '500', lineHeight: 21, marginTop: 6 },
});
