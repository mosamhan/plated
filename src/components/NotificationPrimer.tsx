import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { showAlert } from '@/lib/dialog';
import { tapLight } from '@/lib/haptics';
import { SLOTS, slotLabel } from '@/lib/reminders';
import { useAuth } from '@/store/AuthContext';
import { useStreak } from '@/store/StreakContext';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

/** Asked once per install, whatever the answer. */
const ASKED_KEY = 'plated.remindersPrompted';

/**
 * The one-time "can we remind you?" prompt, shown on first run.
 *
 * Deliberately ahead of the iOS permission dialog: iOS only lets an app ask
 * once, so spending that single chance on a system alert with no context is
 * how apps end up permanently unable to notify anyone. This explains what the
 * notifications actually are first, and only triggers the real dialog if the
 * answer is yes. Declining leaves the toggle in Settings → Preferences.
 */
export function NotificationPrimer() {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { remindersOn, setRemindersOn } = useStreak();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Wait for a session: asking mid-signup is noise, and there's no streak to
    // protect until there's an account.
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(ASKED_KEY)
      .then((asked) => {
        if (!cancelled && !asked && !remindersOn) setVisible(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Only on arrival of a session — not every time the toggle changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const close = () => {
    setVisible(false);
    AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
  };

  const enable = async () => {
    tapLight();
    const result = await setRemindersOn(true);
    close();
    if (result.ok) return;
    if (result.reason === 'denied') {
      showAlert(
        'Notifications are off',
        'No problem — you can turn reminders on any time from Settings → Preferences → Notifications.',
      );
    } else {
      showAlert('Couldn’t schedule reminders', result.message);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="notifications" size={26} color={colors.accent} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Want a nudge at mealtimes?</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Plated can remind you to log what you ate, so your streak survives the days you forget.
            That’s the only thing we send — no marketing, no noise.
          </Text>

          <View style={[styles.slots, { borderColor: colors.border }]}>
            {SLOTS.map((slot) => (
              <View key={`${slot.hour}:${slot.minute}`} style={styles.slot}>
                <Text style={[styles.slotTime, { color: colors.accent }]}>{slotLabel(slot)}</Text>
                <Text style={[styles.slotLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  {slot.title}
                </Text>
              </View>
            ))}
          </View>

          <Pressable onPress={enable} style={[styles.primary, { backgroundColor: colors.accent }]}>
            <Text style={[styles.primaryText, { color: colors.accentText }]}>Turn on reminders</Text>
          </Pressable>
          <Pressable onPress={close} style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: colors.textMuted }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: { width: '100%', maxWidth: 380, borderRadius: 22, padding: spacing.lg, alignItems: 'center' },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  body: { fontSize: 14, fontWeight: '500', lineHeight: 20, textAlign: 'center', marginTop: 8 },
  slots: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 7 },
  slotTime: { fontSize: 13, fontWeight: '800', width: 62 },
  slotLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  primary: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryText: { fontSize: 15, fontWeight: '800' },
  secondary: { paddingVertical: 12, paddingHorizontal: 20, marginTop: 4 },
  secondaryText: { fontSize: 14, fontWeight: '700' },
});
