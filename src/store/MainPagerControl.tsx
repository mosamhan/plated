import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';

import type { SectionKey } from '@/lib/sections';

/** The pager's page order — matches the floating bar exactly. Ranks isn't here: it's an internal view of the Discover page. Messages isn't here either: it's pushed from Home, not swiped between. */
export const PAGE_ORDER: SectionKey[] = ['home', 'platos', 'discover', 'profile'];

interface Ctx {
  /** Live — tracks the drag as it crosses toward a neighbor, not just the settled page. */
  activeSection: SectionKey;
  jumpTo: (section: SectionKey) => void;
  /** Called once by MainPager on mount to hook `jumpTo` up to the real PagerView. */
  registerJump: (fn: (index: number) => void) => void;
  /** Called by MainPager as the live page/drag position changes. */
  setActiveSection: (section: SectionKey) => void;
}

const MainPagerContext = createContext<Ctx | null>(null);

/**
 * Bridges the floating tab bar (chrome rendered by the Tabs navigator) and
 * `MainPager` (real content mounted inside the Home route) — two different
 * subtrees that both need the same live paging state.
 */
export function MainPagerProvider({ children }: { children: ReactNode }) {
  const jumpFnRef = useRef<((index: number) => void) | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('home');

  const jumpTo = useCallback((section: SectionKey) => {
    const index = PAGE_ORDER.indexOf(section);
    if (index < 0) return;
    jumpFnRef.current?.(index);
  }, []);

  const registerJump = useCallback((fn: (index: number) => void) => {
    jumpFnRef.current = fn;
  }, []);

  return (
    <MainPagerContext.Provider value={{ activeSection, jumpTo, registerJump, setActiveSection }}>
      {children}
    </MainPagerContext.Provider>
  );
}

export function useMainPagerControl() {
  const ctx = useContext(MainPagerContext);
  if (!ctx) throw new Error('useMainPagerControl must be used within MainPagerProvider');
  return ctx;
}
