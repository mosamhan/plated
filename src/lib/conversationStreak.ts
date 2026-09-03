import { useCallback, useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { iso, longestStreakFrom, streakFrom } from '@/lib/streakMath';

/** Covers the 200-day milestone tier with room to spare. */
const WINDOW_DAYS = 220;

/** The reference's 5-icon ladder — 3/10/30/100/200 days. */
export const STREAK_MILESTONES = [3, 10, 30, 100, 200] as const;

/** The largest milestone reached so far, or null before the first one. */
export function currentMilestone(streakCount: number): number | null {
  let tier: number | null = null;
  for (const m of STREAK_MILESTONES) {
    if (streakCount >= m) tier = m;
  }
  return tier;
}

interface ConversationStreak {
  current: number;
  longest: number;
  loading: boolean;
}

/**
 * A conversation's chat streak — the same day-walk math as the app-wide
 * check-in streak (`src/lib/streakMath.ts`, shared rather than forked), fed
 * from `conversation_activity_days` (0053_conversation_streaks.sql) instead
 * of `check_ins`. A day only counts once at least 2 distinct people posted in
 * it that day — see the migration for why that one rule covers both 1:1s and
 * groups without branching on `isGroup`.
 *
 * A standalone hook (matching `usePublicCollections.ts`'s pattern) rather
 * than more state on `MessagesContext`, which is already sizeable.
 */
export function useConversationStreak(conversationId: string | undefined): ConversationStreak {
  const [days, setDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!conversationId || !isSupabaseConfigured) {
      setDays(new Set());
      setLoading(false);
      return;
    }
    const since = new Date();
    since.setDate(since.getDate() - WINDOW_DAYS);
    const { data, error } = await supabase
      .from('conversation_activity_days')
      .select('day, user_id')
      .eq('conversation_id', conversationId)
      .gte('day', iso(since));

    if (error) {
      if (__DEV__) console.warn('[Plated] conversation streak fetch failed', error.message);
      setDays(new Set());
      setLoading(false);
      return;
    }

    const sendersByDay = new Map<string, Set<string>>();
    for (const row of (data ?? []) as { day: string; user_id: string }[]) {
      const set = sendersByDay.get(row.day) ?? new Set<string>();
      set.add(row.user_id);
      sendersByDay.set(row.day, set);
    }
    const qualifying = new Set<string>();
    for (const [day, senders] of sendersByDay) {
      if (senders.size >= 2) qualifying.add(day);
    }
    setDays(qualifying);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    // load() only sets state after awaiting the network — same shape as
    // StreakContext's own load(), and the same reason its effect carries
    // this disable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const current = streakFrom(days);
  const longest = Math.max(longestStreakFrom(days), current);
  return { current, longest, loading };
}
