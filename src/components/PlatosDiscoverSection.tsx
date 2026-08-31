import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AutoplayPlatoTile } from '@/components/AutoplayPlatoTile';
import { SectionHeader } from '@/components/SectionHeader';
import { type DiscoverScope, useNearFilter } from '@/hooks/useNearFilter';
import { placeTypeFor } from '@/lib/placeType';
import { expandPlatoPlates } from '@/lib/platos';
import type { CuisineFilterValue } from '@/components/CuisineFilterRow';
import { useData } from '@/store/DataContext';
import { usePlatos } from '@/store/PlatosContext';
import { spacing } from '@/theme/palettes';

export interface PlatosDiscoverSectionHandle {
  /** Called from the page's own scroll handler — re-measures every tile's
   *  on-screen position and starts/stops each one's video accordingly. */
  tick: () => void;
}

const SECTION_CAP = 6;

/**
 * Discover's Platos section — a 2-column grid of live, muted videos that play
 * as they scroll into view. Narrows to whatever cuisine the page is filtered
 * to, so picking Pizza gives you pizza Platos rather than a feed that ignores
 * the filter above it.
 *
 * A Plato covering several plates gets one tile per plate (see
 * `expandPlatoPlates`), all pointing at the same video, so someone curious
 * about the third dish in a video can actually find it.
 */
export const PlatosDiscoverSection = forwardRef<
  PlatosDiscoverSectionHandle,
  {
    scope: DiscoverScope;
    origin: { lat: number; lng: number } | null;
    cuisine: CuisineFilterValue;
    onSeeAll: () => void;
  }
>(function PlatosDiscoverSection({ scope, origin, cuisine, onSeeAll }, ref) {
  const { platos } = usePlatos();
  const { restaurantFor, topRestaurants } = useData();
  const isNear = useNearFilter(scope, origin);
  const checks = useRef<Set<() => void>>(new Set());
  const { width: windowWidth } = useWindowDimensions();
  const tileWidth = (windowWidth - spacing.lg * 2 - spacing.md) / 2;

  useImperativeHandle(ref, () => ({
    tick: () => checks.current.forEach((fn) => fn()),
  }));

  const registerTick = (check: () => void) => {
    checks.current.add(check);
    return () => {
      checks.current.delete(check);
    };
  };

  // Falls back to matching a Plato's free-text `restaurantName` against a
  // known restaurant when it has no `restaurantId` — plenty of Platos are
  // filmed at a place before Plated has a row for it, and filtering shouldn't
  // blank the section out because of that.
  const byName = useMemo(() => {
    const m = new Map<string, ReturnType<typeof topRestaurants>[number]>();
    for (const r of topRestaurants()) m.set(r.name.toLowerCase(), r);
    return m;
  }, [topRestaurants]);

  const tiles = useMemo(() => {
    const resolve = (p: (typeof platos)[number]) =>
      p.restaurantId ? restaurantFor(p.restaurantId) : byName.get(p.restaurantName.toLowerCase());

    const visible = platos.filter((p) => {
      if (p.archived) return false;
      const r = resolve(p);
      if (!isNear(r)) return false;
      if (cuisine === 'overall') return true;
      return !!r && placeTypeFor(r.cuisine) === cuisine;
    });

    // Best-rated Plato at each restaurant earns the badge — same "what should
    // I get here?" logic the plate grid uses. Platos carry no reorder count,
    // so `most-reordered` never applies to them.
    const bestByRestaurant = new Map<string, string>();
    for (const p of visible) {
      const key = p.restaurantId ?? p.restaurantName.toLowerCase();
      const current = bestByRestaurant.get(key);
      const currentRating = current ? (visible.find((x) => x.id === current)?.rating ?? 0) : -1;
      if (p.rating > currentRating) bestByRestaurant.set(key, p.id);
    }

    return visible.flatMap(expandPlatoPlates).slice(0, SECTION_CAP).map((t) => ({
      ...t,
      highlight:
        bestByRestaurant.get(t.video.restaurantId ?? t.video.restaurantName.toLowerCase()) === t.video.id
          ? ('top-rated' as const)
          : undefined,
    }));
  }, [platos, isNear, restaurantFor, byName, cuisine]);

  if (tiles.length === 0) return null;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <SectionHeader title="Platos" subtitle="Creator videos" actionLabel="See all" onAction={onSeeAll} />
      <View style={styles.grid}>
        {tiles.map((t) => (
          <AutoplayPlatoTile
            key={t.key}
            video={t.video}
            title={t.title}
            rating={t.rating}
            width={tileWidth}
            highlight={t.highlight}
            registerTick={registerTick}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, gap: spacing.md },
});
