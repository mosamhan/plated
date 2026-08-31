import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Time spent in Plated, per day.
 *
 * Deliberately on-device only: how long someone uses the app is exactly the
 * kind of thing that shouldn't be sitting in a table anyone could query. It
 * lives in AsyncStorage, it never leaves the phone, and clearing the app
 * clears it.
 *
 * Accumulated from foreground spans rather than sampled on a timer — a timer
 * keeps counting in the background and would report a phone in a pocket as
 * hours of use.
 */

const KEY = 'plated.screentime.v1';
/** Two weeks is enough for a "this week vs last" read without hoarding. */
const KEEP_DAYS = 14;

/** Local YYYY-MM-DD — the day boundary people actually mean. */
export function dayKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type DailyUsage = Record<string, number>;

export async function readUsage(): Promise<DailyUsage> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DailyUsage) : {};
  } catch {
    return {};
  }
}

/**
 * Add a foreground span to today's total, dropping anything older than
 * KEEP_DAYS. Spans under a second are ignored — that's a tab bounce, not use.
 */
export async function recordSpan(ms: number): Promise<void> {
  if (ms < 1000) return;
  const usage = await readUsage();
  const today = dayKey();
  usage[today] = (usage[today] ?? 0) + ms;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const oldest = dayKey(cutoff);
  for (const k of Object.keys(usage)) {
    if (k < oldest) delete usage[k];
  }

  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    // Losing a span is not worth surfacing — the next one still lands.
  }
}

/** The last `days` days, oldest first, with zeroes for days you didn't open it. */
export function lastDays(usage: DailyUsage, days = 7): { key: string; date: Date; ms: number }[] {
  const out: { key: string; date: Date; ms: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    out.push({ key, date: d, ms: usage[key] ?? 0 });
  }
  return out;
}

/** "12m" / "1h 20m" / "—" — a duration at the precision this screen needs. */
export function formatSpan(ms: number): string {
  if (ms < 60_000) return ms > 0 ? '<1m' : '—';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
