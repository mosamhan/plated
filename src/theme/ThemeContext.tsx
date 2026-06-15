import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { DEFAULT_THEME, Palette, THEMES, ThemeName } from '@/theme/palettes';

const STORAGE_KEY = 'plated.theme';

interface ThemeContextValue {
  themeName: ThemeName;
  colors: Palette;
  setTheme: (name: ThemeName) => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored && stored in THEMES) {
          setThemeName(stored as ThemeName);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    AsyncStorage.setItem(STORAGE_KEY, name).catch(() => {});
  }, []);

  const value: ThemeContextValue = {
    themeName,
    colors: THEMES[themeName].palette,
    setTheme,
    ready,
  };

  // Hold first paint until the persisted theme loads — prevents a visible
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
