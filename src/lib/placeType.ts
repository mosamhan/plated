/**
 * What kind of place this is, derived from the cuisine/category string that
 * already comes off Foursquare ("Ramen", "Coffee Shop", "Brasserie"). Derived
 * rather than stored so there's no schema change and no backfill — same
 * approach as `venue.ts`, which this supersedes for map filtering.
 *
 * This is deliberately separate from a place's *status* to the user (loved /
 * been / saved). Those answer different questions, so they filter
 * independently: "show me pizza I've been to" needs both axes, and the old
 * single list — where "Loved" and "Fine dining" were mutually exclusive
 * options — couldn't express it.
 */

export type PlaceType =
  | 'cafe'
  | 'bakery'
  | 'bar'
  | 'pizza'
  | 'sushi'
  | 'ramen'
  | 'burgers'
  | 'mexican'
  | 'italian'
  | 'french'
  | 'steakhouse'
  | 'seafood'
  | 'midEast'
  | 'vegan'
  /** No rule matched. Not offered as a filter — see PLACE_TYPE_META. */
  | 'other';

/**
 * First match wins, so order matters. Ambiguous short words are matched on word
 * boundaries — plain `includes('bar')` also hits "barbecue", and `'fish'` hits
 * "fish and chips" fine but would also hit "shellfish" harmlessly. The
 * genuinely overlapping cases are ordered so the more specific rule runs first:
 * steakhouse claims "barbecue" before bar can see the "bar" inside it.
 */
const RULES: { type: PlaceType; words: string[] }[] = [
  { type: 'sushi', words: ['sushi', 'omakase', 'izakaya', 'japanese'] },
  { type: 'ramen', words: ['ramen', 'noodle', 'udon', 'soba', 'pho'] },
  { type: 'pizza', words: ['pizza', 'pizzeria'] },
  { type: 'burgers', words: ['burger', 'cheeseburger'] },
  { type: 'mexican', words: ['taco', 'tacos', 'taqueria', 'mexican', 'burrito', 'cantina'] },
  { type: 'midEast', words: ['halal', 'kebab', 'shawarma', 'falafel', 'turkish', 'lebanese', 'baklava', 'mediterranean', 'middle eastern'] },
  { type: 'steakhouse', words: ['steak', 'steakhouse', 'chophouse', 'barbecue', 'bbq'] },
  { type: 'seafood', words: ['seafood', 'oyster', 'lobster', 'crab', 'ceviche', 'fish'] },
  { type: 'italian', words: ['italian', 'trattoria', 'osteria', 'pasta'] },
  { type: 'french', words: ['french', 'brasserie', 'bistro', 'fine dining'] },
  { type: 'vegan', words: ['vegan', 'vegetarian', 'plant-based', 'salad'] },
  { type: 'bakery', words: ['bakery', 'patisserie', 'pastry', 'dessert', 'ice cream', 'gelato', 'creamery', 'donut', 'doughnut', 'cupcake', 'bagel', 'chocolate'] },
  { type: 'cafe', words: ['cafe', 'café', 'coffee', 'espresso', 'tea', 'matcha', 'boba', 'bubble tea', 'juice', 'smoothie'] },
  { type: 'bar', words: ['bar', 'pub', 'brewery', 'cocktail', 'wine', 'speakeasy', 'taproom'] },
];

// A trailing "s"/"es" is allowed so plurals match without listing both forms —
// Foursquare returns "Burgers", "Tacos", "Bagels". Anything else after the word
// still fails the boundary, which is what keeps "bar" out of "barbecue".
const matches = (haystack: string, word: string) =>
  new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(es|s)?([^a-z]|$)`, 'i').test(haystack);

/** Classify a place from its cuisine string. Unknown cuisines fall to 'other'. */
export function placeTypeFor(cuisine?: string): PlaceType {
  const c = (cuisine ?? '').toLowerCase();
  if (!c) return 'other';
  for (const rule of RULES) {
    if (rule.words.some((w) => matches(c, w))) return rule.type;
  }
  return 'other';
}

/** How the current user relates to a place. A place can be several at once. */
export type PlaceStatus = 'loved' | 'been' | 'saved';

/** A rating at or above this is "loved" rather than merely "been". */
export const LOVED_RATING = 8.5;
