import * as SecureStore from 'expo-secure-store';

/**
 * The on-device list of accounts a user has ever signed into on this
 * device — what lets the Account Center switch between them without
 * re-entering credentials. Kept in SecureStore (Keychain), not AsyncStorage
 * like Supabase's own single active session, because refresh tokens are
 * long-lived credentials for accounts that aren't the active one.
 *
 * There's deliberately no separate "active account" pointer here — Supabase's
 * own `persistSession` already tracks whichever account is currently live and
 * restores it on cold start, so "last signed into" falls out of that for free.
 */
export interface SavedAccount {
  id: string;
  email: string;
  name: string;
  handle: string;
  avatar: string;
  access_token: string;
  refresh_token: string;
}

const KEY = 'plated.savedAccounts';

async function readAll(): Promise<SavedAccount[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as SavedAccount[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(accounts: SavedAccount[]): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(accounts));
}

/**
 * Every write below is a read-modify-write against the same single key, and
 * there are two independent callers (AuthContext upserting tokens on sign-in,
 * DataContext upserting profile fields once they load) that can land close
 * together — e.g. switching accounts. Without serializing them, the second
 * write's `readAll()` can miss the first write's change entirely, so its
 * `writeAll()` silently clobbers it — the exact bug where a freshly
 * signed-into account never made it into the saved list. Chaining every
 * write through this queue guarantees each one starts only after the
 * previous has fully landed, so this can't happen.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.catch(() => {});
  return result;
}

export async function getSavedAccounts(): Promise<SavedAccount[]> {
  // Waits for any writes already queued so a read right after a write (e.g.
  // AuthContext's setAccounts(await getSavedAccounts())) sees them, not a
  // stale snapshot from before they landed.
  return enqueueWrite(readAll);
}

/**
 * Upserts by id. Only the fields passed in are overwritten — called both at
 * sign-in (id/email/tokens only) and by DataContext once profile fields are
 * known, without either caller needing the other's data.
 */
export async function upsertSavedAccount(entry: Partial<SavedAccount> & Pick<SavedAccount, 'id'>): Promise<void> {
  return enqueueWrite(async () => {
    const accounts = await readAll();
    const i = accounts.findIndex((a) => a.id === entry.id);
    if (i === -1) {
      accounts.push({ email: '', name: '', handle: '', avatar: '', access_token: '', refresh_token: '', ...entry });
    } else {
      accounts[i] = { ...accounts[i], ...entry };
    }
    await writeAll(accounts);
  });
}

export async function updateSavedAccountProfile(
  id: string,
  fields: Pick<SavedAccount, 'name' | 'handle' | 'avatar'>
): Promise<void> {
  return enqueueWrite(async () => {
    const accounts = await readAll();
    const i = accounts.findIndex((a) => a.id === id);
    if (i === -1) return;
    accounts[i] = { ...accounts[i], ...fields };
    await writeAll(accounts);
  });
}

export async function removeSavedAccount(id: string): Promise<void> {
  return enqueueWrite(async () => {
    const accounts = await readAll();
    await writeAll(accounts.filter((a) => a.id !== id));
  });
}
