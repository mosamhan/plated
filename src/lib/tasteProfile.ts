import type { PlaceType } from '@/lib/placeType';

/**
 * The recommendation algorithm behind the Home feed's and Platos feed's
 * personalization: every signal that already exists client-side (an
 * onboarding pick, a like, a save, a reorder, a share, a view, an explicit
 * "don't show me this" exclusion) folds into one affinity score per
 * `PlaceType`, so "what does this person actually like" keeps building from
 * how they use the app, not just what they said once at signup.
 *
 * Deliberately additive to the existing "Feed personalization v1" scoring in
 * DataContext (following/recent-search/visited) rather than a replacement —
 * that comparator already works and is tuned; this is one more term in it,
 * and the equivalent replacement for the Platos feed's old pure shuffle.
 *
 * Weights, in order of how deliberate/costly the signal is to the user:
 * a reorder ("I'd get this again") and an onboarding pick ("I like this
 * kind of food") are the strongest, explicit signals the app has. A share
 * and a save are close behind — both cost a real action and both mean
 * "this is worth someone else's/my own future attention." A like is cheap
 * (one tap, often given generously) so it counts for less. A view is nearly
 * free — everything gets viewed — so it barely moves the needle, existing
 * mostly to keep engaged-but-quiet categories from scoring exactly 0. An
 * exclusion is the one explicit negative signal and outweighs a single
 * like/view/share of the same category, though not enough that one
 * excluded video can cancel out a whole category someone otherwise reorders.
 */
export const TASTE_WEIGHTS = {
  onboarding: 4,
  reorder: 3,
  save: 2,
  share: 2,
  like: 1,
  view: 0.25,
  exclude: -3,
} as const;

export interface TasteSignals {
  /** Categories picked at onboarding (or edited later in Settings). */
  onboarding: PlaceType[];
  reorders: PlaceType[];
  saves: PlaceType[];
  shares: PlaceType[];
  likes: PlaceType[];
  views: PlaceType[];
  /** "Do not include in taste profile" — plato_taste_exclusions. */
  excludes: PlaceType[];
}

export type TasteAffinity = Partial<Record<PlaceType, number>>;

/** A category no rule matched — not a real preference signal either way. */
const SCORABLE = (t: PlaceType) => t !== 'other';

export function computeTasteAffinity(signals: TasteSignals): TasteAffinity {
  const score: TasteAffinity = {};
  const add = (types: PlaceType[], weight: number) => {
    for (const t of types) {
      if (!SCORABLE(t)) continue;
      score[t] = (score[t] ?? 0) + weight;
    }
  };
  add(signals.onboarding, TASTE_WEIGHTS.onboarding);
  add(signals.reorders, TASTE_WEIGHTS.reorder);
  add(signals.saves, TASTE_WEIGHTS.save);
  add(signals.shares, TASTE_WEIGHTS.share);
  add(signals.likes, TASTE_WEIGHTS.like);
  add(signals.views, TASTE_WEIGHTS.view);
  add(signals.excludes, TASTE_WEIGHTS.exclude);
  return score;
}

export function affinityFor(scores: TasteAffinity, type: PlaceType): number {
  return scores[type] ?? 0;
}

/**
 * Ranks items by score (descending) for a feed that isn't already
 * chronological — the Platos feed, which used to be a pure shuffle.
 * Page order still wins first: content from an earlier page never sorts
 * below content from a later one, so a paginated load never reorders
 * anything already rendered (the same page-stability pattern DataContext's
 * feedOrders uses). Within a page, a random tiebreak keeps equal-score
 * content — most of it, for anyone without a strong affinity yet — from
 * landing in the same order every time, which is what a plain sort by score
 * alone would otherwise do.
 */
export function rankByAffinity<T>(
  items: T[],
  idOf: (item: T) => string,
  scoreOf: (item: T) => number,
  pageOf: (id: string) => number,
): T[] {
  const jitter = new Map(items.map((item) => [idOf(item), Math.random()]));
  return [...items].sort((a, b) => {
    const idA = idOf(a);
    const idB = idOf(b);
    const pageA = pageOf(idA);
    const pageB = pageOf(idB);
    if (pageA !== pageB) return pageA - pageB;
    const scoreDiff = scoreOf(b) - scoreOf(a);
    if (scoreDiff !== 0) return scoreDiff;
    return jitter.get(idA)! - jitter.get(idB)!;
  });
}
