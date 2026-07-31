import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/store/AuthContext';

// Per-account so signing in as someone else doesn't inherit the dismissal.
const KEY_PREFIX = 'plated.hideCreatorCard.';

interface CreatorCardContextValue {
  /** null until the stored preference has been read. */
  visible: boolean | null;
  setVisible: (visible: boolean) => void;
}

const CreatorCardContext = createContext<CreatorCardContextValue | undefined>(undefined);

/**
 * Whether the creator-earnings card shows on your own profile. Lives in a
 * provider rather than inside the card so the Settings toggle and the profile
 * agree without either having to re-read storage on focus.
 */
export function CreatorCardProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [visible, setVisibleState] = useState<boolean | null>(null);
  const key = `${KEY_PREFIX}${userId ?? 'anon'}`;

  useEffect(() => {
    let cancelled = false;
    setVisibleState(null);
    AsyncStorage.getItem(key)
      .then((v) => {
        if (!cancelled) setVisibleState(v !== '1');
      })
      .catch(() => {
        if (!cancelled) setVisibleState(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setVisible = useCallback(
    (next: boolean) => {
      setVisibleState(next);
      // Stored as "hidden" so the absence of a key means visible — the default
      // for a fresh account.
      if (next) AsyncStorage.removeItem(key).catch(() => {});
      else AsyncStorage.setItem(key, '1').catch(() => {});
    },
    [key],
  );

  return (
    <CreatorCardContext.Provider value={{ visible, setVisible }}>
      {children}
    </CreatorCardContext.Provider>
  );
}

export function useCreatorCard(): CreatorCardContextValue {
  const ctx = useContext(CreatorCardContext);
  if (!ctx) throw new Error('useCreatorCard must be used within a CreatorCardProvider');
  return ctx;
}
