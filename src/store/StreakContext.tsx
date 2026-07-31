import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { cancelReminders, requestReminderPermission, scheduleReminders } from '@/lib/reminders';
import { useAuth } from '@/store/AuthContext';

/** Opt-in preference for the local check-in reminders. */
const REMINDERS_KEY = 'plated.remindersOn';

/** How much history to pull. A streak longer than this isn't worth the payload. */
const WINDOW_DAYS = 120;

interface StreakContextValue {
  /** Consecutive days ending today (or yesterday — see `isLive`). */
  current: number;
  /** Best run in the fetched window. */
  longest: number;
  /** ISO `YYYY-MM-DD` days checked in, for the dot strip. */
  days: Set<string>;
  /** False when the streak is still standing but today hasn't been counted yet. */
  checkedInToday: boolean;
  loading: boolean;
  remindersOn: boolean;
  setRemindersOn: (on: boolean) => Promise<ReminderResult>;
}

/** Why enabling reminders didn't take, so the UI can explain rather than sit dead. */
export type ReminderResult =
  | { ok: true }
  | { ok: false; reason: 'denied' }
  | { ok: false; reason: 'unavailable'; message: string };

const StreakContext = createContext<StreakContextValue | undefined>(undefined);

const iso = (d: Date) => d.toISOString().slice(0, 10);

const dayBefore = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
};

/**
 * Walk backwards from today. Today missing doesn't break the run — the day isn't
 * over yet, so a streak "ends" only once a whole day has been skipped.
 */
export function streakFrom(days: Set<string>, today = iso(new Date())): number {
  let cursor = days.has(today) ? today : dayBefore(today);
  if (!days.has(cursor)) return 0;
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = dayBefore(cursor);
  }
  return n;
}

export function longestStreakFrom(days: Set<string>): number {
  let best = 0;
  for (const day of days) {
    // Only start counting from the beginning of a run, so each run is walked once.
    if (days.has(dayBefore(day))) continue;
    let n = 0;
    let cursor = day;
    while (days.has(cursor)) {
      n++;
      const next = new Date(`${cursor}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = iso(next);
    }
    best = Math.max(best, n);
  }
  return best;
}

export function StreakProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;

  const [days, setDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [remindersOn, setRemindersOnState] = useState(false);

  const load = useCallback(async () => {
    // Nothing to fetch without a session; `loading` is derived below, so this
    // path sets no state at all.
    if (!live || !userId) return;
    // Opening the app *is* the check-in. record_check_in derives the date from
    // the server clock, so the streak can't be advanced by changing the phone's.
    const { error: rpcError } = await supabase.rpc('record_check_in');
    if (rpcError) console.warn('[streak] check-in failed:', rpcError.message);

    const since = new Date();
    since.setDate(since.getDate() - WINDOW_DAYS);
    const { data, error } = await supabase
      .from('check_ins')
      .select('day')
      .gte('day', iso(since))
      .order('day', { ascending: false });

    if (error) console.warn('[streak] history failed:', error.message);
    setDays(new Set((data ?? []).map((r: { day: string }) => r.day)));
    setLoaded(true);
  }, [live, userId]);

  useEffect(() => {
    // load() only sets state after awaiting the network; the rule can't see
    // past the call, so it reads this as a synchronous update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Derived rather than stored: there's then no synchronous setState anywhere in
  // the load path, and no way for the flag to disagree with the data.
  const loading = live && !!userId && !loaded;

  const current = useMemo(() => streakFrom(days), [days]);
  const longest = useMemo(() => Math.max(longestStreakFrom(days), current), [days, current]);
  const checkedInToday = days.has(iso(new Date()));

  // Restore the preference, then keep the queue in step with it. Rescheduling
  // here (rather than only on toggle) is what lets the schedule skip a day the
  // user has already checked in on.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(REMINDERS_KEY)
      .then(async (stored) => {
        if (cancelled) return;
        const on = stored === '1';
        setRemindersOnState(on);
        if (on) await scheduleReminders(checkedInToday);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Only re-run when the check-in state actually changes.
  }, [checkedInToday]);

  const setRemindersOn = useCallback(
    async (on: boolean): Promise<ReminderResult> => {
      try {
        if (!on) {
          setRemindersOnState(false);
          await AsyncStorage.setItem(REMINDERS_KEY, '0').catch(() => {});
          await cancelReminders();
          return { ok: true };
        }
        const granted = await requestReminderPermission();
        if (!granted) return { ok: false, reason: 'denied' };
        setRemindersOnState(true);
        await AsyncStorage.setItem(REMINDERS_KEY, '1').catch(() => {});
        await scheduleReminders(checkedInToday);
        return { ok: true };
      } catch (e) {
        // Scheduling is native. If the module isn't there, say so — a switch
        // that flips back with no explanation is worse than an error.
        const message = e instanceof Error ? e.message : String(e);
        console.warn('[reminders] failed:', message);
        return { ok: false, reason: 'unavailable', message };
      }
    },
    [checkedInToday],
  );

  const value = useMemo<StreakContextValue>(
    () => ({ current, longest, days, checkedInToday, loading, remindersOn, setRemindersOn }),
    [current, longest, days, checkedInToday, loading, remindersOn, setRemindersOn],
  );

  return <StreakContext.Provider value={value}>{children}</StreakContext.Provider>;
}

export function useStreak() {
  const ctx = useContext(StreakContext);
  if (!ctx) throw new Error('useStreak must be used within StreakProvider');
  return ctx;
}
