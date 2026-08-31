import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Handle rules, shared by the signup form and the DB trigger.
 *
 * `normalizeHandle` must stay in step with `handle_new_user()` and
 * `handle_available()` in 0046_signup_hardening.sql — same strip, same
 * lowercase — or the client would check one string and claim another.
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** Strips a leading @ and anything that isn't a letter, digit, underscore or dot. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
}

/** A human-readable reason the handle is unusable, or null when it's fine. */
export function handleProblem(raw: string): string | null {
  const h = normalizeHandle(raw);
  if (h.length < HANDLE_MIN) return `Username needs at least ${HANDLE_MIN} characters.`;
  if (h.length > HANDLE_MAX) return `Username can be at most ${HANDLE_MAX} characters.`;
  if (!/^[a-z0-9]/.test(h)) return 'Username has to start with a letter or number.';
  return null;
}

/**
 * Is this handle free? Answered by a `security definer` RPC because the signup
 * screen has no session yet, so it can't read `profiles` directly.
 *
 * Returns true when it can't tell (no backend, network failure). A false
 * "already taken" would block a legitimate signup, whereas an optimistic yes
 * just falls through to the DB, which de-duplicates rather than failing.
 */
export async function isHandleAvailable(raw: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  try {
    const { data, error } = await supabase.rpc('handle_available', { p_handle: normalizeHandle(raw) });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

/** Deliberately loose — the confirmation email is the real check. */
export function isProbablyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
