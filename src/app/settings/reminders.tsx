import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { showAlert } from '@/lib/dialog';
import { tick } from '@/lib/haptics';
import { nextReminderAt, queuedReminderCount, SLOTS, slotLabel } from '@/lib/reminders';
import { useStreak } from '@/store/StreakContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

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
 * Notification preferences.
 *
 * These used to live on the streak screen, which meant the only way to change
 * your notification settings was through a gamification feature — the wrong
 * place to look, and the wrong place to be asked. Permission is now requested
 * once on first run; this is where it's managed afterwards.
 */
export default function Reminders() {
  const { colors } = useTheme();
  const { checkedInToday, remindersOn, setRemindersOn } = useStreak();

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
      <ScreenHeader title="Notifications" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          Plated only sends check-in reminders — a nudge at the times you’d be deciding what to eat.
          Nothing else pushes to your phone.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Check-in reminders</Text>
              <Text style={[styles.rowHint, { color: colors.textMuted }]}>
                Three a day — skipped entirely on days you’ve already been in.
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
                {slotLabel(slot)}
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

        <View style={[styles.note, { borderColor: colors.border }]}>
          <Ionicons name="flame-outline" size={18} color={colors.accent} />
          <Text style={[styles.noteText, { color: colors.textMuted }]}>
            Reminders exist to protect your streak — see it on the flame in the Home header.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: spacing.lg },
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
  note: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.xl,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 19 },
});
