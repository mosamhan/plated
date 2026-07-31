import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { Palette, THEMES, ThemeName } from '@/theme/palettes';

/** What the user picked. 'auto' follows the phone's own light/dark setting. */
export type ThemeMode = 'light' | 'dark' | 'auto';

const MODE_KEY = 'plated.themeMode';
/** Pre-'auto' key, which stored a palette name directly. Read once, then migrated. */
const LEGACY_KEY = 'plated.theme';

const DEFAULT_MODE: ThemeMode = 'auto';

const paletteFor = (mode: ThemeMode, system: 'light' | 'dark'): ThemeName => {
  const effective = mode === 'auto' ? system : mode;
  return effective === 'dark' ? 'noir' : 'saffron';
};

interface ThemeContextValue {
  /** The user's choice, including 'auto'. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** The palette actually in use — 'auto' has already been resolved here. */
  themeName: ThemeName;
  colors: Palette;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [ready, setReady] = useState(false);

  // Re-renders on its own whenever the phone flips light/dark, so 'auto' tracks
  // the system live rather than only at launch.
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then(async (stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'auto') {
          setModeState(stored);
          return;
        }
        // Anyone who picked a palette before 'auto' existed keeps that choice
        // rather than being silently switched over to following the system.
        const legacy = await AsyncStorage.getItem(LEGACY_KEY).catch(() => null);
        if (legacy && legacy in THEMES) {
          const migrated: ThemeMode = legacy === 'noir' ? 'dark' : 'light';
          setModeState(migrated);
          AsyncStorage.setItem(MODE_KEY, migrated).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  }, []);

  const themeName = paletteFor(mode, system);

  const value: ThemeContextValue = {
    mode,
    setMode,
    themeName,
    colors: THEMES[themeName].palette,
    ready,
  };

  // Hold first paint until the persisted choice loads — prevents a visible
  // default-theme flash for users who picked a different palette.
  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
