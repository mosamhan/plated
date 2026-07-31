import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { showAlert } from '@/lib/dialog';
import { tick } from '@/lib/haptics';
import { nextReminderAt, queuedReminderCount, SLOTS } from '@/lib/reminders';
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

/** "today at 6:30pm" / "tomorrow at 9:30am" / "Sat at 9:30am". */
function describeWhen(when: Date): string {
  const time = timeLabel(when.getHours(), when.getMinutes());
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const dayDelta = Math.round((+new Date(when).setHours(0, 0, 0, 0) - +midnight) / 86400000);
  if (dayDelta <= 0) return `today at ${time}`;
  if (dayDelta === 1) return `tomorrow at ${time}`;
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][when.getDay()]} at ${time}`;
}

const timeLabel = (hour: number, minute: number) => {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, '0')}${suffix}`;
};

/**
 * Streak — what the daily check-in has added up to, plus the reminders that keep
 * it going. Both live on one screen because they're the same loop: the reminder
 * exists to protect the streak.
 */
export default function Streak() {
  const { colors } = useTheme();
  const { current, longest, days, checkedInToday, remindersOn, setRemindersOn } = useStreak();

  // The time comes from the schedule definition; the OS is asked only whether
  // anything is really queued, so this can't promise a reminder that isn't.
  const [queued, setQueued] = useState(0);
  const refreshQueued = useCallback(() => {
    queuedReminderCount()
      .then(setQueued)
      .catch(() => setQueued(0));
  }, []);

  useEffect(refreshQueued, [refreshQueued, remindersOn]);

  const next = nextReminderAt(checkedInToday);

  const onToggle = async (nextOn: boolean) => {
    tick();
    const result = await setRemindersOn(nextOn);
    refreshQueued();
    if (result.ok) return;
    if (result.reason === 'denied') {
      showAlert(
        'Notifications are off',
        'Plated can’t send reminders until notifications are enabled for it in iOS Settings.',
      );
    } else {
      showAlert('Couldn’t schedule reminders', result.message);
    }
  };

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

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Reminders</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Daily check-in reminders</Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                Three nudges a day — skipped entirely on days you’ve already been in.
              </Text>
            </View>
            <Switch
              value={remindersOn}
              onValueChange={onToggle}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#FFFFFF"
            />
          </View>

          {SLOTS.map((slot) => (
            <View
              key={`${slot.hour}:${slot.minute}`}
              style={[styles.slotRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.slotTime, { color: remindersOn ? colors.accent : colors.textMuted }]}>
                {timeLabel(slot.hour, slot.minute)}
              </Text>
              <Text style={[styles.slotTitle, { color: colors.text }]} numberOfLines={1}>
                {slot.title}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          {remindersOn && queued > 0 && next
            ? `Next reminder ${describeWhen(next)}. Scheduled on your phone, so it arrives whether or not you have signal.`
            : 'These are scheduled on your phone, so they arrive whether or not you have signal.'}
        </Text>
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
  sectionTitle: { fontSize: 17, fontWeight: '800', marginTop: spacing.xl, marginBottom: 8 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowLabel: { fontSize: 15, fontWeight: '800' },
  rowHint: { fontSize: 13, fontWeight: '500', marginTop: 3, lineHeight: 17 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  slotTime: { fontSize: 13, fontWeight: '800', width: 66 },
  slotTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  footnote: { fontSize: 12, fontWeight: '500', marginTop: 12, lineHeight: 17 },
});
