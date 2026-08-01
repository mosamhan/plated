import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRouter } from 'expo-router';

import { ScreenHeader } from '@/components/ScreenHeader';
import { useStreak } from '@/store/StreakContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const DOTS = 7;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Mon…Sun initials for the dot strip, ending today. */
function lastDays(count: number): { day: string; label: string }[] {
  const out: { day: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({ day: iso(d), label: 'SMTWTFS'[d.getDay()] });
  }
  return out;
}

/**
 * Streak — what the daily check-in has added up to, plus the reminders that keep
 * it going. Both live on one screen because they're the same loop: the reminder
 * exists to protect the streak.
 */
export default function Streak() {
  const { colors } = useTheme();
  const router = useRouter();
  const { current, longest, days, checkedInToday, remindersOn } = useStreak();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="Your streak" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.flame, { color: colors.accent }]}>🔥</Text>
          <Text style={[styles.count, { color: colors.text }]}>{current}</Text>
          <Text style={[styles.countLabel, { color: colors.textMuted }]}>
            {current === 1 ? 'day in a row' : 'days in a row'}
          </Text>
          <Text style={[styles.subtle, { color: colors.textMuted }]}>
            {checkedInToday
              ? 'Today’s counted. Come back tomorrow to keep it.'
              : 'Open Plated today to keep it going.'}
          </Text>

          <View style={styles.dots}>
            {lastDays(DOTS).map(({ day, label }) => {
              const hit = days.has(day);
              return (
                <View key={day} style={styles.dotCol}>
                  <View
                    style={[
                      styles.dot,
                      hit
                        ? { backgroundColor: colors.accent }
                        : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
                    ]}>
                    {hit && <Ionicons name="checkmark" size={13} color={colors.accentText} />}
                  </View>
                  <Text style={[styles.dotLabel, { color: colors.textMuted }]}>{label}</Text>
                </View>
              );
            })}
          </View>

          <View style={[styles.best, { borderTopColor: colors.border }]}>
            <Text style={[styles.bestLabel, { color: colors.textMuted }]}>Longest streak</Text>
            <Text style={[styles.bestValue, { color: colors.text }]}>
              {longest} {longest === 1 ? 'day' : 'days'}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/settings/reminders')}
          style={({ pressed }) => [
            styles.remindersLink,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Ionicons name="notifications-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Check-in reminders</Text>
            <Text style={[styles.rowHint, { color: colors.textMuted }]}>
              {remindersOn ? 'On — three nudges a day' : 'Off'} · in Settings
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 4,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flame: { fontSize: 30 },
  count: { fontSize: 52, fontWeight: '800', letterSpacing: -1.5, marginTop: 2 },
  countLabel: { fontSize: 15, fontWeight: '700', marginTop: -4 },
  subtle: { fontSize: 13, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dotCol: { alignItems: 'center', gap: 5 },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dotLabel: { fontSize: 11, fontWeight: '700' },
  best: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bestLabel: { fontSize: 14, fontWeight: '600' },
  bestValue: { fontSize: 14, fontWeight: '800' },
  remindersLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: spacing.xl,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 15, fontWeight: '800' },
  rowHint: { fontSize: 13, fontWeight: '500', marginTop: 3, lineHeight: 17 },
});
