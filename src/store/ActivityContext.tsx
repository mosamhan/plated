import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { CURRENT_USER_ID } from '@/data/users';
import { showAlert } from '@/lib/dialog';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/store/AuthContext';

/**
 * Who's around.
 *
 * The heartbeat fires when the app comes to the foreground, not on a timer: a
 * background interval would keep reporting you as present while your phone sits
 * in a pocket, which is precisely the thing that makes activity status feel
 * like surveillance rather than information.
 *
 * The reciprocity rule ("turn yours off and you stop seeing everyone else's")
 * lives in `visible_last_active` in 0023. This context just reads what the
 * database is willing to tell it, so switching the setting off can't be undone
 * by a patched client.
 */

/** How often, at most, to report presence — a foreground bounce shouldn't spam. */
const HEARTBEAT_THROTTLE_MS = 60_000;

interface ActivityContextValue {
  /** Your own setting. When false, nobody sees you and you see nobody. */
  showActivity: boolean;
  setShowActivity: (on: boolean) => void;
  /** Last-active time for a user, or undefined when it isn't shown to you. */
  lastActiveFor: (userId: string) => string | undefined;
  /** Pull fresh times for a set of people (an inbox load, a thread open). */
  refresh: (userIds: string[]) => void;
}

const ActivityContext = createContext<ActivityContextValue | undefined>(undefined);

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** Demo presence so the inbox reads believably before a backend is wired. */
const DEMO_LAST_ACTIVE: Record<string, string> = {
  u1: minutesAgo(1),
  u2: minutesAgo(24),
  u3: minutesAgo(180),
  u4: minutesAgo(60 * 26),
  u5: minutesAgo(8),
};

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const live = isSupabaseConfigured;

  const [showActivity, setShowActivityState] = useState(true);
  const [lastActive, setLastActive] = useState<Record<string, string>>(
    live ? {} : DEMO_LAST_ACTIVE,
  );

  // ── Heartbeat ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live || !userId) return;
    let lastBeat = 0;
    const beat = () => {
      if (Date.now() - lastBeat < HEARTBEAT_THROTTLE_MS) return;
      lastBeat = Date.now();
      supabase.rpc('touch_last_active').then(() => {});
      setLastActive((prev) => ({ ...prev, [userId]: new Date().toISOString() }));
    };

    beat();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') beat();
    });
    return () => sub.remove();
  }, [live, userId]);

  // ── Own setting ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live || !userId) return;
    supabase
      .from('profiles')
      .select('show_activity')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.show_activity === false) setShowActivityState(false);
      });
  }, [live, userId]);

  const setShowActivity = useCallback(
    (on: boolean) => {
      const previous = showActivity;
      setShowActivityState(on);
      // Turning it off should take effect immediately in both directions — you
      // stop seeing everyone the moment you stop being seen.
      if (!on) setLastActive({});
      if (!live || !userId) return;
      supabase
        .from('profiles')
        .update({ show_activity: on })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) {
            if (__DEV__) console.warn('[Plated] activity setting failed', error);
            setShowActivityState(previous);
            showAlert(
              'Could not change this',
              'Your activity setting is unchanged — please try again.',
            );
          }
        });
    },
    [live, userId, showActivity],
  );

  // ── Reading other people ────────────────────────────────────────────────────
  const refresh = useCallback(
    (userIds: string[]) => {
      if (!live || !userId || !showActivity) return;
      const wanted = [...new Set(userIds)].filter(Boolean);
      if (wanted.length === 0) return;
      // One call per person: visible_last_active applies the reciprocity rule
      // per subject, so it can't be batched into a single select.
      wanted.forEach((id) => {
        supabase.rpc('visible_last_active', { subject: id }).then(({ data }) => {
          if (data) setLastActive((prev) => ({ ...prev, [id]: data as string }));
        });
      });
    },
    [live, userId, showActivity],
  );

  const lastActiveFor = useCallback(
    (id: string) => {
      if (!showActivity) return undefined;
      if (!live && id === CURRENT_USER_ID) return new Date().toISOString();
      return lastActive[id];
    },
    [lastActive, showActivity, live],
  );

  const value = useMemo(
    () => ({ showActivity, setShowActivity, lastActiveFor, refresh }),
    [showActivity, setShowActivity, lastActiveFor, refresh],
  );

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity(): ActivityContextValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivity must be used within an ActivityProvider');
  return ctx;
}
