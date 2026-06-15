import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ReportReason, ReportTarget } from '@/data/types';
import { warn } from '@/lib/haptics';
import { useData } from '@/store/DataContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const REASONS: ReportReason[] = [
  'Spam or misleading',
  'Offensive or inappropriate',
  'Not food / wrong content',
  'Harassment or hate',
  // Play Child Safety Standards: CSAE concerns need a dedicated in-app path.
  'Child safety concern',
  'Intellectual property',
  'Other',
];

const TITLES: Record<ReportTarget, string> = {
  plate: 'Report plate',
  user: 'Report user',
  comment: 'Report comment',
};

/**
 * Content reporting — required by Apple App Review Guideline 1.2 for apps
 * with user-generated content. Reports are acknowledged in-app and (in
 * production) routed to a moderation queue with a 24h SLA.
 */
export default function Report() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { targetType = 'plate', targetId = '' } = useLocalSearchParams<{
    targetType?: ReportTarget;
    targetId?: string;
  }>();
  const { reportContent } = useData();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    if (!reason) return;
    reportContent(targetType, targetId, reason, details.trim() || undefined);
    warn();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Report" closeMode />
        <View style={styles.doneWrap}>
          <View style={[styles.doneIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="shield-checkmark" size={40} color={colors.accent} />
          </View>
          <Text style={[styles.doneTitle, { color: colors.text }]}>Thanks — report received</Text>
          <Text style={[styles.doneBody, { color: colors.textMuted }]}>
            Our moderation team reviews reports within 24 hours. Content that violates our
            Community Guidelines is removed, and repeat offenders lose their accounts.
          </Text>
          <Button label="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={TITLES[targetType]} closeMode />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.lead, { color: colors.textMuted }]}>
          Why are you reporting this? Your report is anonymous.
        </Text>

        <View style={{ gap: 10, marginTop: spacing.lg }}>
          {REASONS.map((r) => {
            const active = r === reason;
            return (
              <Pressable
                key={r}
                onPress={() => setReason(r)}
                style={[
                  styles.reason,
                  {
                    backgroundColor: active ? colors.accentSoft : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  },
                ]}>
                <Text style={[styles.reasonText, { color: colors.text }]}>{r}</Text>
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={active ? colors.accent : colors.textMuted}
                />
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="Anything else we should know? (optional)"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[
            styles.details,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        <Button label="Submit report" size="lg" onPress={submit} disabled={!reason} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  reasonText: { fontSize: 15, fontWeight: '600' },
  details: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    minHeight: 90,
    fontSize: 14,
    fontWeight: '500',
    textAlignVertical: 'top',
  },
  doneWrap: { flex: 1, alignItems: 'center', padding: spacing.xl, paddingTop: 60, gap: spacing.lg },
  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 20, fontWeight: '800' },
  doneBody: { fontSize: 14, fontWeight: '500', lineHeight: 21, textAlign: 'center' },
});
