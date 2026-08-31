/**
 * Shared ranking for anything searched by free text across the app —
 * restaurants, plates, Platos, people. One scoring/ranking scheme so results
 * don't feel different from one search surface to the next.
 *
 * `scoreTextMatch` is exactly the scheme `InlineSearch` originated (name
 * starts-with beats includes beats a secondary-field include beats no
 * match) — extracted here so both InlineSearch and the full search screen
 * rank identically instead of drifting into two slightly different feels.
 */

import { distanceKm } from '@/lib/geo';

/** 0 = starts with, 1 = includes, 2 = secondary field includes, -1 = no match. */
export function scoreTextMatch(name: string, needle: string, secondary?: string): number {
  const n = name.toLowerCase();
  const q = needle.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.includes(q)) return 1;
  if (secondary && secondary.toLowerCase().includes(q)) return 2;
  return -1;
}

/**
 * Ranks already-scored items nearby-first without excluding the rest: text
 * match quality is the primary key, distance from the user only breaks ties
 * within the same match quality, and items with no known coordinates simply
 * sort after ones that do at that same tier rather than being dropped. Falls
 * through to `rating` descending as a final tiebreak when neither the score
 * nor distance separates two items.
 */
export function rankWithDistance<T>(
  items: T[],
  opts: {
    score: (item: T) => number;
    coords?: (item: T) => { lat: number; lng: number } | undefined;
    rating?: (item: T) => number | undefined;
    origin?: { lat: number; lng: number } | null;
  },
): T[] {
  const { score, coords, rating, origin } = opts;
  const distanceOf = (item: T): number => {
    if (!origin || !coords) return Infinity;
    const c = coords(item);
    return c ? distanceKm(origin, c) : Infinity;
  };
  return [...items]
    .map((item) => ({ item, s: score(item), d: distanceOf(item), r: rating?.(item) ?? 0 }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.d - b.d || b.r - a.r)
    .map((x) => x.item);
}
