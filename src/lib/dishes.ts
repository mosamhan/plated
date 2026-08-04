import type { Order } from '@/data/types';
import { postMedia } from '@/lib/post';

/**
 * One dish at a restaurant, with every rating of it collapsed into an average.
 *
 * "Top-rated plates here" used to list raw orders, so a restaurant where three
 * people rated the same thing showed "Flat White 9.7 / Flat White 8.9 / Nitro
 * Cold Brew 8.7" — repetitive, and it read as three different dishes. A dish is
 * the unit people actually care about ("is the Flat White good here?"), and one
 * averaged number answers that better than a list of individual opinions.
 */
export interface DishSummary {
  /** Display name, taken from the best-rated rating so casing stays natural. */
  dishName: string;
  /** Mean of every rating of this dish at this restaurant. */
  rating: number;
  /** How many ratings the average is over — shown so it can be judged. */
  count: number;
  photo: string;
  /**
   * The best-rated order for this dish. Tapping a summary has to land
   * *somewhere*, and the top rating is the most useful single write-up.
   */
  orderId: string;
}

/** Case- and spacing-insensitive, so "flat white" and "Flat White" are one dish. */
export const dishKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

/** A menu row: a Plated-rated dish, or an unrated item from the API menu. */
export type MenuRow =
  | { rated: true; dishName: string; rating: number; count: number; photo: string }
  | { rated: false; dishName: string };

/**
 * The menu, Foursquare-first with crowd ratings overlaid.
 *
 * Rated dishes lead, in the order `summarizeDishes` ranked them (best average,
 * then most-rated). Any API menu item nobody has rated is appended in menu
 * order, deduped against the rated dishes by name. An empty `apiMenu` — the
 * common premium-field-absent case — leaves exactly the crowd menu, which is
 * the graceful fallback.
 */
export function mergeMenu(crowd: DishSummary[], apiMenu: string[]): MenuRow[] {
  const ratedKeys = new Set(crowd.map((d) => dishKey(d.dishName)));
  const rated: MenuRow[] = crowd.map((d) => ({
    rated: true,
    dishName: d.dishName,
    rating: d.rating,
    count: d.count,
    photo: d.photo,
  }));
  const seenApi = new Set<string>();
  const unrated: MenuRow[] = [];
  for (const name of apiMenu) {
    const k = dishKey(name);
    if (!name.trim() || ratedKeys.has(k) || seenApi.has(k)) continue;
    seenApi.add(k);
    unrated.push({ rated: false, dishName: name.trim() });
  }
  return [...rated, ...unrated];
}

const key = dishKey;

/**
 * Group orders by dish and average their ratings, best average first.
 *
 * Ties break on rating count: with two dishes averaging 9.0, the one five
 * people agreed on is the safer recommendation than the one a single person
 * rated, so it ranks higher.
 */
export function summarizeDishes(orders: Order[]): DishSummary[] {
  // A rating is one *plate*, not one post: a post with several dishes expands
  // via postMedia() so each dish is grouped and averaged on its own.
  type Rated = { dishName: string; rating: number; photo: string; orderId: string };
  const groups = new Map<string, Rated[]>();
  for (const o of orders) {
    for (const m of postMedia(o)) {
      if (!m.dishName) continue;
      const rated: Rated = { dishName: m.dishName, rating: m.rating, photo: m.uri, orderId: o.id };
      const k = key(m.dishName);
      const existing = groups.get(k);
      if (existing) existing.push(rated);
      else groups.set(k, [rated]);
    }
  }

  return [...groups.values()]
    .map((group) => {
      const best = group.reduce((a, b) => (b.rating > a.rating ? b : a));
      const total = group.reduce((sum, r) => sum + r.rating, 0);
      return {
        dishName: best.dishName,
        rating: total / group.length,
        count: group.length,
        photo: best.photo,
        orderId: best.orderId,
      };
    })
    .sort((a, b) => b.rating - a.rating || b.count - a.count);
}
