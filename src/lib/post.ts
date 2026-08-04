import type { Order, PostMedia } from '@/data/types';

/** How many plates a single post may hold — matches the picker's selection cap. */
export const MAX_POST_MEDIA = 20;

/**
 * A post's media as a carousel, always non-empty.
 *
 * New posts carry `media[]` directly. Legacy posts (single `photo` +
 * `dishName` + `rating`) are normalised to a one-entry carousel here, so every
 * consumer — feed card, detail, ordering — only ever deals with `PostMedia[]`
 * and never has to branch on which shape a post is.
 */
export function postMedia(order: Order): PostMedia[] {
  if (order.media && order.media.length > 0) return order.media;
  return [{ uri: order.photo, type: 'image', dishName: order.dishName, rating: order.rating }];
}

/**
 * Every individual plate rated on a post, best first. This is the unit the
 * restaurant average and the dish rankings count — a post with five plates
 * contributes five ratings, not one.
 */
export function plateRatings(order: Order): { dishName: string; rating: number; photo: string }[] {
  return postMedia(order)
    .filter((m) => m.dishName)
    .map((m) => ({ dishName: m.dishName, rating: m.rating, photo: m.uri }))
    .sort((a, b) => b.rating - a.rating);
}

/** Mean rating across every plate on a post — its headline score. */
export function postAverageRating(order: Order): number {
  const plates = postMedia(order);
  if (plates.length === 0) return order.rating;
  return plates.reduce((s, m) => s + m.rating, 0) / plates.length;
}

/**
 * Share args for a whole post — the subject is the spread, not one dish. A
 * multi-plate post shares as "N plates" at its average rating; a single-plate
 * post shares as that dish. Used by both the feed card and the post-detail
 * header so they share identically.
 */
export function postShareArgs(order: Order): { dishName: string; rating: number } {
  const plates = postMedia(order);
  return plates.length > 1
    ? { dishName: `${plates.length} plates`, rating: postAverageRating(order) }
    : { dishName: order.dishName, rating: order.rating };
}
