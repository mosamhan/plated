import type { Order } from '@/data/types';

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

const key = dishKey;

/**
 * Group orders by dish and average their ratings, best average first.
 *
 * Ties break on rating count: with two dishes averaging 9.0, the one five
 * people agreed on is the safer recommendation than the one a single person
 * rated, so it ranks higher.
 */
export function summarizeDishes(orders: Order[]): DishSummary[] {
  const groups = new Map<string, Order[]>();
  for (const o of orders) {
    if (!o.dishName) continue;
    const k = key(o.dishName);
    const existing = groups.get(k);
    if (existing) existing.push(o);
    else groups.set(k, [o]);
  }

  return [...groups.values()]
    .map((group) => {
      const best = group.reduce((a, b) => (b.rating > a.rating ? b : a));
      const total = group.reduce((sum, o) => sum + o.rating, 0);
      return {
        dishName: best.dishName,
        rating: total / group.length,
        count: group.length,
        photo: best.photo,
        orderId: best.id,
      };
    })
    .sort((a, b) => b.rating - a.rating || b.count - a.count);
}
