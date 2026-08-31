/**
 * Activity status — "Active now", "Active 5m ago".
 *
 * Deliberately coarse. A timestamp accurate to the second tells people exactly
 * when you picked up your phone, which is more than a food app needs to say
 * about anyone. Anything older than a few days stops being reported at all
 * rather than becoming an increasingly pointed "Active 3 weeks ago".
 */

/** Below this, someone counts as here right now. */
export const ACTIVE_NOW_MS = 3 * 60_000;

/** Past this, we stop saying anything. */
const STALE_MS = 7 * 24 * 3600_000;

export function isActiveNow(lastActive?: string | null, now = Date.now()): boolean {
  if (!lastActive) return false;
  return now - +new Date(lastActive) < ACTIVE_NOW_MS;
}

/** The label for an inbox row or a thread header. Null when there's nothing to say. */
export function activityLabel(lastActive?: string | null, now = Date.now()): string | null {
  if (!lastActive) return null;
  const ms = now - +new Date(lastActive);
  if (ms < 0) return 'Active now';
  if (ms < ACTIVE_NOW_MS) return 'Active now';
  if (ms > STALE_MS) return null;

  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Active ${days}d ago`;
}
