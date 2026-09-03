/**
 * Pure day-walking math shared by every streak in the app — the app-wide
 * daily check-in streak (`StreakContext.tsx`) and the per-conversation chat
 * streak (`conversationStreak.ts`). Both reduce to the same shape: a set of
 * ISO `YYYY-MM-DD` days on which "the thing" happened, walked backward from
 * today for the current run and forward through the whole set for the best
 * run. Kept here once rather than forked, so a bug fix in the walk logic
 * can't fix one streak and not the other.
 */

export const iso = (d: Date) => d.toISOString().slice(0, 10);

export const dayBefore = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
};

/** Consecutive days ending today (or yesterday, if today hasn't happened yet). */
export function streakFrom(days: Set<string>, today = iso(new Date())): number {
  let cursor = days.has(today) ? today : dayBefore(today);
  if (!days.has(cursor)) return 0;
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = dayBefore(cursor);
  }
  return n;
}

/** The best consecutive run anywhere in the fetched window, not just the current one. */
export function longestStreakFrom(days: Set<string>): number {
  let best = 0;
  for (const day of days) {
    // Only start counting from the beginning of a run, so each run is walked once.
    if (days.has(dayBefore(day))) continue;
    let n = 0;
    let cursor = day;
    while (days.has(cursor)) {
      n++;
      const next = new Date(`${cursor}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = iso(next);
    }
    best = Math.max(best, n);
  }
  return best;
}
