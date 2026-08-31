import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsRow, SettingsSection } from '@/components/SettingsKit';
import { DailyUsage, formatSpan, lastDays, readUsage } from '@/lib/screenTime';
import { useStreak } from '@/store/StreakContext';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const CHART_HEIGHT = 150;

/**
 * Time management — a week of daily use, and the one recurring nudge the app
 * sends.
 *
 * The numbers are read from on-device storage only (see lib/screenTime); this
 * screen is the only thing that ever looks at them. Today is drawn in the
 * accent so the bar you're adding to right now is the one you can find.
 */
export default function TimeManagement() {
  const { colors } = useTheme();
  const router = useRouter();
  const { remindersOn } = useStreak();
  const [usage, setUsage] = useState<DailyUsage>({});

  useEffect(() => {
    readUsage().then(setUsage);
  }, []);

  const week = useMemo(() => lastDays(usage, 7), [usage]);
  const total = week.reduce((sum, d) => sum + d.ms, 0);
  const daysUsed = week.filter((d) => d.ms > 0).length;
  const average = daysUsed > 0 ? total / daysUsed : 0;
  // Scale to the busiest day, with a floor so a quiet week doesn't turn a
  // two-minute day into a full-height bar.
  const peak = Math.max(...week.map((d) => d.ms), 15 * 60_000);
  const todayKey = week[week.length - 1]?.key;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Time management" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <SettingsSection title="Your time on Plated">
          <View style={styles.chartCard}>
            <Text style={[styles.total, { color: colors.text, fontFamily: displayFont }]}>
              {formatSpan(average)}
            </Text>
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
              {daysUsed > 0
                ? `Daily average · ${formatSpan(total)} this week`
                : 'No time recorded yet'}
            </Text>

            <View style={styles.chart}>
              {week.map((d) => {
                const isToday = d.key === todayKey;
                // Bars keep a visible stub at zero so the week reads as seven
                // days rather than a gap where a day should be.
                const h = Math.max(3, Math.round((d.ms / peak) * CHART_HEIGHT));
                return (
                  <View key={d.key} style={styles.column}>
                    <Text
                      style={[
                        styles.barValue,
                        { color: isToday ? colors.accent : colors.textMuted },
                      ]}
                      numberOfLines={1}>
                      {d.ms > 0 ? formatSpan(d.ms) : ''}
                    </Text>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: h,
                          backgroundColor: isToday ? colors.accent : colors.border,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.barDay,
                        { color: isToday ? colors.accent : colors.textMuted },
                      ]}>
                      {d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </SettingsSection>

        <SettingsSection
          title="Reminders"
          footer="Plated has no infinite feed to get lost in — the plate feed ends. The one recurring nudge the app sends is the streak reminder, so it lives here alongside the numbers it affects.">
          <SettingsRow
            icon="alarm-outline"
            label="Daily reminders"
            value={remindersOn ? 'On' : 'Off'}
            onPress={() => router.push('/settings/reminders')}
            last
          />
        </SettingsSection>

        <Text style={[styles.privacy, { color: colors.textMuted }]}>
          These numbers are stored on this device only and are never sent to Plated.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  total: { fontSize: 30, letterSpacing: -0.5 },
  totalLabel: { fontSize: 13, fontWeight: '600', marginTop: 2, marginBottom: 18 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: CHART_HEIGHT + 40 },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  barValue: { fontSize: 9, fontWeight: '700' },
  bar: { width: '100%', borderRadius: radius.sm, minHeight: 3 },
  barDay: { fontSize: 11, fontWeight: '700' },
  privacy: { fontSize: 12, fontWeight: '500', lineHeight: 17, textAlign: 'center', marginTop: 4 },
});
