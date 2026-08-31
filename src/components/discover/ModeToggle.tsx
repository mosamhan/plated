import { SegmentedPill } from '@/components/discover/SegmentedPill';
import type { ExploreMode } from '@/store/ExploreModeContext';

const OPTIONS: { key: ExploreMode; label: string }[] = [
  { key: 'discover', label: 'Discover' },
  { key: 'ranks', label: 'Ranks' },
];

/** Discover/Ranks header pill — stands in for the page title itself. Discover is the initial, selected state. */
export function ModeToggle({ mode, setMode }: { mode: ExploreMode; setMode: (m: ExploreMode) => void }) {
  return <SegmentedPill value={mode} onChange={setMode} options={OPTIONS} minWidth={200} fontSize={16} />;
}
