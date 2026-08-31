import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { DiscoverContent } from '@/components/discover/DiscoverContent';
import { PlatosContent } from '@/components/discover/PlatosContent';
import { HomeContent } from '@/components/HomeContent';
import { ProfileContent } from '@/components/ProfileContent';
import { tick } from '@/lib/haptics';
import { PAGE_ORDER, useMainPagerControl } from '@/store/MainPagerControl';

const PAGES = [
  { key: 'home', Content: HomeContent },
  { key: 'platos', Content: PlatosContent },
  { key: 'discover', Content: DiscoverContent },
  { key: 'profile', Content: ProfileContent },
] as const;

/**
 * The real, always-mounted host for Home/Platos/Discover/Profile — a native
 * pager, so swiping tracks real live content, not a placeholder. Each page
 * is lazily mounted on first visit and kept alive after that (video/map/feed
 * state shouldn't reset just because you swiped away).
 */
export function MainPager() {
  const { registerJump, setActiveSection } = useMainPagerControl();
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const lastIndexRef = useRef(0);
  // Only a finger-driven drag earns a completion tick — jumpTo's own tap
  // already ticks, and settling into the same page it started on shouldn't.
  const draggingRef = useRef(false);

  return (
    <PagerView
      ref={(instance) => {
        if (instance) registerJump((index) => instance.setPage(index));
      }}
      style={styles.pager}
      initialPage={0}
      onPageScrollStateChanged={(e) => {
        const state = e.nativeEvent.pageScrollState;
        if (state === 'dragging') draggingRef.current = true;
        else if (state === 'idle') draggingRef.current = false;
      }}
      onPageSelected={(e) => {
        const index = e.nativeEvent.position;
        lastIndexRef.current = index;
        setActiveSection(PAGE_ORDER[index]);
        setVisited((v) => (v.has(index) ? v : new Set(v).add(index)));
        if (draggingRef.current) tick();
      }}
      onPageScroll={(e) => {
        const { position, offset } = e.nativeEvent;
        const crossed = offset > 0.5;
        const index = crossed ? position + 1 : position;
        if (index === lastIndexRef.current) return;
        lastIndexRef.current = index;
        setActiveSection(PAGE_ORDER[index] ?? PAGE_ORDER[position]);
      }}>
      {PAGES.map(({ key, Content }, index) => (
        <View key={key} style={styles.page} collapsable={false}>
          {visited.has(index) ? <Content /> : null}
        </View>
      ))}
    </PagerView>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1 },
  page: { flex: 1 },
});
