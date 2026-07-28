/**
 * Venue type — is a place a café / drinks spot, or a sit-down restaurant?
 * Derived from its cuisine/category string (Plated covers both, Beli-style).
 * Kept as a derived helper so there's no schema change: cuisine already comes
 * from Foursquare's category (e.g. "Tea Room", "Coffee Shop", "Café").
 */

export type VenueType = 'restaurant' | 'cafe';

// Keywords that mark a place as a café / drinks / dessert spot rather than a
// full restaurant. Matched case-insensitively as substrings of the cuisine.
const CAFE_KEYWORDS = [
  'café',
  'cafe',
  'coffee',
  'espresso',
  'tea',
  'matcha',
  'boba',
  'bubble tea',
  'juice',
  'smoothie',
  'dessert',
  'bakery',
  'patisserie',
  'pastr',
  'ice cream',
  'gelato',
  'creamery',
  'chocolate',
  'donut',
  'doughnut',
  'cupcake',
];

/** Classify a place by its cuisine/category string. */
export function venueTypeFor(cuisine?: string): VenueType {
  const c = (cuisine ?? '').toLowerCase();
  return CAFE_KEYWORDS.some((k) => c.includes(k)) ? 'cafe' : 'restaurant';
}

/** True when the cuisine reads as a café / drinks spot. */
export function isCafe(cuisine?: string): boolean {
  return venueTypeFor(cuisine) === 'cafe';
}
