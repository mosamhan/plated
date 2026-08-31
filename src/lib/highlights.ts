import type { Order } from '@/data/types';

/**
 * A badge a plate earns *relative to its own restaurant*, shown on Discover
 * tiles only.
 *
 * Relative rather than absolute (e.g. "9.0+") on purpose: an absolute bar
 * means a strong restaurant lights up every tile while a modest one never
 * earns a badge at all, which tells you nothing about what to order. Scoped
 * per restaurant, the badge answers the question people actually have —
 * "if I go here, what should I get?"
 */
export type PlateHighlight = 'top-rated' | 'most-reordered';

/**
 * A plate needs at least this many reorders before "Most Reordered" means
 * anything — otherwise the tag goes to whichever plate happens to have the
 * single reorder at a quiet restaurant.
 */
const MIN_REORDERS = 3;

export const HIGHLIGHT_META: Record<PlateHighlight, { label: string; icon: 'star' | 'repeat' }> = {
  'top-rated': { label: 'Top Rated', icon: 'star' },
  'most-reordered': { label: 'Most Reordered', icon: 'repeat' },
};

/**
 * Maps each plate id to the badge it earns, if any. Ties break toward the
 * plate with more ratings behind it, so a lone 9.8 doesn't outrank a dish
 * five people agreed on.
 *
 * A plate that wins both is tagged `top-rated`: one badge per tile keeps the
 * grid readable, and "best here" is the more useful of the two.
 */
export function computeHighlights(orders: Order[]): Map<string, PlateHighlight> {
  const byRestaurant = new Map<string, Order[]>();
  for (const o of orders) {
    const group = byRestaurant.get(o.restaurantId);
    if (group) group.push(o);
    else byRestaurant.set(o.restaurantId, [o]);
  }

  const out = new Map<string, PlateHighlight>();
  for (const group of byRestaurant.values()) {
    const best = group.reduce((a, b) => (b.rating > a.rating ? b : a));
    const reordered = group.reduce((a, b) => ((b.reorders ?? 0) > (a.reorders ?? 0) ? b : a));

    if ((reordered.reorders ?? 0) >= MIN_REORDERS) out.set(reordered.id, 'most-reordered');
    // Written second so it wins if one plate is both the best-rated and the
    // most-reordered here.
    out.set(best.id, 'top-rated');
  }
  return out;
}

/**
 * How strongly a plate is trending — engagement, gated on actually being
 * good. Used to order Discover's grid, never shown as a badge: "trending"
 * is a reason to surface something, not a claim worth making on a tile.
 */
export function trendingScore(order: Order): number {
  if (order.rating <= 8) return 0;
  return order.likes + order.comments;
}
