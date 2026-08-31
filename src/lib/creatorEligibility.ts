/**
 * "Become a Plated Creator" — the multi-criteria bar that replaces the old
 * single follower-count gate. All five thresholds are required (AND, not
 * any-one-of): a single easy-to-game metric (follower count alone) is exactly
 * what let farm accounts through before.
 *
 * This module only computes progress for display — it is never what actually
 * flips `profiles.compensation_eligible` (that column has no client UPDATE
 * grant; see 0013_lock_profile_trust_columns.sql). The real flip happens
 * server-side in the check-creator-eligibility Edge Function, which
 * re-verifies these same counts against the database before writing anything.
 * Its THRESHOLDS constant must be kept in sync with this one by hand — Deno
 * vs. React Native, no shared module between the two runtimes.
 *
 * These numbers are placeholders — start conservative, tune from real data.
 */
export const CREATOR_THRESHOLDS = {
  platesRated: 25,
  platosPosted: 10,
  followers: 1000,
  likes: 500,
  views: 5000,
};

export type CreatorEligibilityCounts = typeof CREATOR_THRESHOLDS;

export interface CreatorEligibilityCriterion {
  key: keyof CreatorEligibilityCounts;
  label: string;
  value: number;
  threshold: number;
  met: boolean;
  /** 0–1, clamped. */
  progress: number;
}

const CRITERIA_LABELS: Record<keyof CreatorEligibilityCounts, string> = {
  platesRated: 'Plates rated',
  platosPosted: 'Platos posted',
  followers: 'Followers',
  likes: 'Total likes',
  views: 'Total views',
};

export function evaluateCreatorEligibility(counts: CreatorEligibilityCounts): {
  criteria: CreatorEligibilityCriterion[];
  meetsAll: boolean;
} {
  const criteria = (Object.keys(CREATOR_THRESHOLDS) as (keyof CreatorEligibilityCounts)[]).map((key) => {
    const value = counts[key];
    const threshold = CREATOR_THRESHOLDS[key];
    return {
      key,
      label: CRITERIA_LABELS[key],
      value,
      threshold,
      met: value >= threshold,
      progress: Math.min(value / threshold, 1),
    };
  });
  return { criteria, meetsAll: criteria.every((c) => c.met) };
}

/** Derives the five counts from data already loaded client-side — no extra fetches. */
export function creatorEligibilityCounts(opts: {
  followers: number;
  plates: { likes: number }[];
  platos: { likes: number; views: number }[];
}): CreatorEligibilityCounts {
  const plateLikes = opts.plates.reduce((sum, p) => sum + (p.likes ?? 0), 0);
  const platoLikes = opts.platos.reduce((sum, p) => sum + (p.likes ?? 0), 0);
  const views = opts.platos.reduce((sum, p) => sum + (p.views ?? 0), 0);
  return {
    platesRated: opts.plates.length,
    platosPosted: opts.platos.length,
    followers: opts.followers,
    likes: plateLikes + platoLikes,
    views,
  };
}
