import { createContext, ReactNode, useContext, useState } from 'react';

export type ExploreMode = 'discover' | 'ranks';

interface Ctx {
  mode: ExploreMode;
  setMode: (mode: ExploreMode) => void;
}

const ExploreModeContext = createContext<Ctx | null>(null);

/**
 * Discover/Ranks are two views inside the same pager page — Platos moved out
 * to become its own page, so it's no longer one of these. This just tracks
 * which of the two Discover is currently showing.
 */
export function ExploreModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ExploreMode>('discover');
  return <ExploreModeContext.Provider value={{ mode, setMode }}>{children}</ExploreModeContext.Provider>;
}

export function useExploreMode() {
  const ctx = useContext(ExploreModeContext);
  if (!ctx) throw new Error('useExploreMode must be used within ExploreModeProvider');
  return ctx;
}
