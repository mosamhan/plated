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
/**
 * The taste-profile dashboard's "progress names" — a fun, escalating ladder
 * so a category's score reads as a level-up rather than a bare number.
 * Thresholds are paced against TASTE_WEIGHTS above: picking a category at
 * onboarding alone (4) doesn't clear Fan on its own — one more real signal
 * (a reorder, a couple of likes) does, so the first level-up feels earned
 * by using the app, not just by ticking a box once.
 */
export const TASTE_TIERS = [
  { min: 0, name: 'Curious' },
  { min: 5, name: 'Fan' },
  { min: 12, name: 'Regular' },
  { min: 22, name: 'Enthusiast' },
  { min: 35, name: 'Connoisseur' },
  { min: 55, name: 'Legend' },
] as const;

export interface TasteTierProgress {
  tier: string;
  /** Absent on the top tier — there's nothing further to climb toward. */
  nextTier?: string;
  /** 0–1 progress toward nextTier; 1 (maxed) when already on the top tier. */
  progress: number;
}

export function tierProgress(score: number): TasteTierProgress {
  let current: (typeof TASTE_TIERS)[number] = TASTE_TIERS[0];
  let next: (typeof TASTE_TIERS)[number] | undefined;
  for (let i = 0; i < TASTE_TIERS.length; i++) {
    if (score >= TASTE_TIERS[i].min) current = TASTE_TIERS[i];
    else {
      next = TASTE_TIERS[i];
      break;
    }
  }
  if (!next) return { tier: current.name, progress: 1 };
  const span = next.min - current.min;
  return { tier: current.name, nextTier: next.name, progress: span > 0 ? (score - current.min) / span : 1 };
}

export interface CategoryRank {
  type: PlaceType;
  score: number;
  tier: string;
  nextTier?: string;
  progress: number;
}

/**
 * The dashboard's ranked list — every category with a real signal, plus any
 * onboarding pick even at a low score (the user told us directly; a 0.25-
 * point view shouldn't be the only thing deciding whether it's worth
 * showing), minus anything muted as "not really me". Muting is a hard
 * filter here, on top of the heavy negative weight it already carries in
 * computeTasteAffinity — dismissed is dismissed, not just downweighted.
 */
export function rankCategories(
  affinity: TasteAffinity,
  onboarding: PlaceType[],
  muted: PlaceType[],
): CategoryRank[] {
  const mutedSet = new Set(muted);
  const types = new Set<PlaceType>([...Object.keys(affinity) as PlaceType[], ...onboarding]);
  const ranked: CategoryRank[] = [];
  for (const type of types) {
    if (!SCORABLE(type) || mutedSet.has(type)) continue;
    const score = affinityFor(affinity, type);
    if (score <= 0 && !onboarding.includes(type)) continue;
    ranked.push({ type, score, ...tierProgress(score) });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/** The dashboard's headline — "The Pizza Enthusiast" for a real top category, a plain invitation before there's enough signal to say anything. */
export function archetypeTitle(ranked: CategoryRank[], labelOf: (type: PlaceType) => string): string {
  if (ranked.length === 0 || ranked[0].score <= 0) return 'Just Getting Started';
  return `The ${labelOf(ranked[0].type)} ${ranked[0].tier}`;
}

/** One weighted, dated interaction — a like, a save, a reorder, a share, or
 *  an onboarding pick — feeding the "how this developed over time" chart. */
export interface TasteEvent {
  createdAt: string;
  type: PlaceType;
  weight: number;
}

export interface TasteHistoryPoint {
  weekStart: string;
  /** Cumulative total across every category up to and including this week. */
  total: number;
}

/**
 * Buckets dated interactions into weekly cumulative totals for a simple
 * growth sparkline — deliberately one combined total rather than a line per
 * category (this codebase hand-rolls small charts rather than pulling in a
 * charting library; a multi-series chart isn't worth that trade-off here).
 * `baseline` is added to every point — the onboarding picks' weight, which
 * has no single interaction timestamp of its own (only "current picks as of
 * now"), so it reads as a floor under the real, dated activity rather than
 * a dated event that would otherwise have to be pinned to some arbitrary day.
 */
export function buildTasteHistory(events: TasteEvent[], baseline: number, weeks = 8): TasteHistoryPoint[] {
  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const points: TasteHistoryPoint[] = [];
  const sorted = [...events].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  for (let w = weeks - 1; w >= 0; w--) {
    const cutoff = now - w * WEEK_MS;
    const total = sorted.reduce((sum, e) => (+new Date(e.createdAt) <= cutoff ? sum + e.weight : sum), baseline);
    points.push({ weekStart: new Date(cutoff).toISOString(), total });
  }
  return points;
}

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
