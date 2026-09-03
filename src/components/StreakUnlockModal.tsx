import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { STREAK_MILESTONES } from '@/lib/conversationStreak';
import { displayFont } from '@/theme/fonts';
import { radius, spacing } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeContext';

const seenKey = (conversationId: string, tier: number) => `plated.streakSeen.${conversationId}.${tier}`;

/**
 * Celebration modal for a newly-reached chat-streak milestone (3/10/30/100/
 * 200 days). Shown once per tier per conversation, tracked locally via
 * AsyncStorage — same one-shot-flag convention as
 * `plated.locationAsked`/`plated.remindersPrompted` — rather than a new DB
 * column, since "have I personally seen this celebration" has no reason to
 * sync across devices.
 */
export function StreakUnlockModal({
  conversationId,
  streakCount,
}: {
  conversationId: string | undefined;
  streakCount: number;
}) {
  const { colors } = useTheme();
  const [tier, setTier] = useState<number | null>(null);

  useEffect(() => {
    if (!conversationId || streakCount <= 0) return;
    let cancelled = false;
    (async () => {
      // Walk from the highest reached tier down, so a streak that jumped
      // several tiers between app opens surfaces only the newest celebration
      // rather than queuing a stack of them.
      for (let i = STREAK_MILESTONES.length - 1; i >= 0; i--) {
        const candidate = STREAK_MILESTONES[i];
        if (streakCount < candidate) continue;
        const seen = await AsyncStorage.getItem(seenKey(conversationId, candidate));
        if (cancelled) return;
        if (!seen) setTier(candidate);
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, streakCount]);

  const dismiss = () => {
    if (conversationId && tier) {
      AsyncStorage.setItem(seenKey(conversationId, tier), '1').catch(() => {});
    }
    setTier(null);
  };

  return (
    <Modal visible={!!tier} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={(e) => e.stopPropagation()}>
          <Text style={styles.flame}>🔥</Text>
          <Text style={[styles.title, { color: colors.text, fontFamily: displayFont }]}>
            Streak has been going for{'\n'}🔥 {streakCount} days
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            A streak unlocks when at least 2 people send messages for 3 consecutive days. Keep chatting to
            reach the next badge.
          </Text>
          <View style={styles.ladder}>
            {STREAK_MILESTONES.map((m) => (
              <View key={m} style={styles.ladderItem}>
                <Ionicons name="flame" size={22} color={streakCount >= m ? colors.ratingLow : colors.border} />
                <Text style={[styles.ladderLabel, { color: colors.textMuted }]}>{m}d</Text>
              </View>
            ))}
          </View>
          <Button label="Got it" size="lg" style={styles.button} onPress={dismiss} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '86%',
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
  },
  flame: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center', lineHeight: 24 },
  body: { fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 10, lineHeight: 18 },
  ladder: { flexDirection: 'row', gap: 18, marginTop: 18 },
  ladderItem: { alignItems: 'center', gap: 4 },
  ladderLabel: { fontSize: 11, fontWeight: '700' },
  button: { marginTop: 20, alignSelf: 'stretch' },
});
