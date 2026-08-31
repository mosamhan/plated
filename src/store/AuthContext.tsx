import { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getSavedAccounts, removeSavedAccount, SavedAccount, upsertSavedAccount } from '@/lib/accountStore';
import { normalizeHandle } from '@/lib/handles';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  handle: string;
}

interface AuthResult {
  error?: string;
  /** signUp only: true when email confirmation is required before a session exists. */
  needsConfirmation?: boolean;
  /** True when the user backed out of an OAuth sheet — not an error worth showing. */
  cancelled?: boolean;
}

interface AuthContextValue {
  signedIn: boolean;
  /** True while restoring a persisted session on cold start. */
  loading: boolean;
  /** Supabase user id (the profile id), or null. */
  userId: string | null;
  signIn: (email?: string, password?: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Google via the system browser (PKCE), exchanged for a Supabase session. */
  signInWithGoogle: () => Promise<AuthResult>;
  /** Native Sign in with Apple. Only offered on iOS — see `appleAvailable`. */
  signInWithApple: () => Promise<AuthResult>;
  /** Whether the device can actually do native Apple sign-in. */
  appleAvailable: boolean;
  /** Sends a password-reset email that deep-links back into the app. */
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  /** Every account signed into on this device — powers the Account Center. */
  accounts: SavedAccount[];
  /** Swaps the live Supabase session to a saved account, no credentials needed. */
  switchAccount: (id: string) => Promise<AuthResult>;
  /** Forgets a saved account on this device (doesn't touch its server session). */
  removeAccount: (id: string) => Promise<void>;
  /** Re-reads the saved-accounts list — DataContext calls this after syncing profile fields into it, since that write doesn't otherwise notify this state. */
  refreshAccounts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Where OAuth and password-reset redirects come back to (see app.config.ts `scheme`). */
const redirectTo = AuthSession.makeRedirectUri({ scheme: 'plated' });

/**
 * Supabase returns its session in the URL *fragment* after an OAuth redirect.
 * `detectSessionInUrl` is off (that's a browser-only feature), so the tokens
 * are pulled out here and handed to `setSession` explicitly.
 */
async function sessionFromRedirect(url: string): Promise<string | undefined> {
  const fragment = url.split('#')[1];
  if (!fragment) {
    const err = new URL(url).searchParams.get('error_description');
    return err ?? 'Sign-in did not complete.';
  }
  const params = new URLSearchParams(fragment);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return params.get('error_description') ?? 'Sign-in did not complete.';
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  return error?.message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  // Mock fallback flag for when no backend is configured (keeps the repo runnable).
  const [mockSignedIn, setMockSignedIn] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);

  // Loaded independently of whatever the live session is — still needed to
  // show other saved accounts even right after signing out of the active one.
  useEffect(() => {
    getSavedAccounts().then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Refreshing (ambient or via setSession) rotates the refresh token
    // (`enable_refresh_token_rotation` in supabase/config.toml), which
    // invalidates whatever was stored before — so *every* non-null session
    // seen here gets re-synced, not just at sign-in, or a saved account's
    // token would go stale the first time it sits idle in the background.
    const sync = async (s: Session | null) => {
      setSession(s);
      if (!s) return;
      await upsertSavedAccount({
        id: s.user.id,
        email: s.user.email ?? '',
        access_token: s.access_token,
        refresh_token: s.refresh_token,
      });
      setAccounts(await getSavedAccounts());
    };
    supabase.auth
      .getSession()
      .then(({ data }) => sync(data.session))
      // Without this a failed restore leaves `loading` true forever, which
      // shows the boot spinner instead of the sign-in screen.
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      sync(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const signIn = async (email?: string, password?: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      setMockSignedIn(true);
      return {};
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email ?? '',
        password: password ?? '',
      });
      return error ? { error: error.message } : {};
    } catch {
      return { error: 'Couldn’t reach Plated. Check your connection and try again.' };
    }
  };

  const signUp = async (input: SignUpInput): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      setMockSignedIn(true);
      return {};
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          // Read by the handle_new_user() DB trigger to seed the profile row.
          data: { name: input.name, handle: normalizeHandle(input.handle) },
        },
      });
      if (error) return { error: error.message };
      return { needsConfirmation: !data.session };
    } catch {
      return { error: 'Couldn’t reach Plated. Check your connection and try again.' };
    }
  };

  const signInWithGoogle = async (): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      setMockSignedIn(true);
      return {};
    }
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          // Supabase would otherwise open the URL itself, which on native does
          // nothing useful — we need the URL back so it can be opened in an
          // auth session that can hand us the redirect.
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error: error.message };
      if (!data?.url) return { error: 'Google sign-in is unavailable right now.' };

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return { cancelled: true };
      const err = await sessionFromRedirect(result.url);
      return err ? { error: err } : {};
    } catch {
      return { error: 'Couldn’t reach Google. Check your connection and try again.' };
    }
  };

  const signInWithApple = async (): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      setMockSignedIn(true);
      return {};
    }
    try {
      // Apple signs the *hashed* nonce; Supabase verifies against the raw one,
      // which is what binds this credential to this specific request.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) return { error: 'Apple didn’t return a sign-in token.' };

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) return { error: error.message };

      // Apple only ever sends the real name on the *first* authorization —
      // if it isn't captured now it can't be retrieved later, so it's written
      // through immediately rather than left for an onboarding step.
      const full = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
      if (full) await supabase.from('profiles').update({ name: full }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '');
      return {};
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
      return { error: 'Apple sign-in didn’t complete. Please try again.' };
    }
  };

  const sendPasswordReset = async (email: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) return {};
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      return error ? { error: error.message } : {};
    } catch {
      return { error: 'Couldn’t send the reset email. Check your connection and try again.' };
    }
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) {
      setMockSignedIn(false);
      return;
    }
    const uid = session?.user.id;
    await supabase.auth.signOut();
    // Logging out forgets the account, unlike switching away from it —
    // otherwise it'd still show up as one tap from being signed back in.
    if (uid) {
      await removeSavedAccount(uid);
      setAccounts(await getSavedAccounts());
    }
  };

  const switchAccount = async (id: string): Promise<AuthResult> => {
    const target = accounts.find((a) => a.id === id);
    if (!target) return { error: 'That account isn’t saved on this device.' };
    try {
      const { error } = await supabase.auth.setSession({
        access_token: target.access_token,
        refresh_token: target.refresh_token,
      });
      if (error) {
        // The refresh token this account was last saved with no longer
        // works (rotated away or expired) — nothing to switch into, so
        // drop it rather than leave a row that fails every time it's tapped.
        await removeSavedAccount(id);
        setAccounts(await getSavedAccounts());
        return { error: 'That account needs you to sign in again.' };
      }
      return {};
    } catch {
      return { error: 'Couldn’t switch accounts. Check your connection and try again.' };
    }
  };

  const removeAccount = async (id: string): Promise<void> => {
    await removeSavedAccount(id);
    setAccounts(await getSavedAccounts());
  };

  const refreshAccounts = async (): Promise<void> => {
    setAccounts(await getSavedAccounts());
  };

  const value: AuthContextValue = {
    signedIn: isSupabaseConfigured ? !!session : mockSignedIn,
    loading,
    userId: session?.user.id ?? null,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    signInWithApple,
    appleAvailable,
    sendPasswordReset,
    accounts,
    switchAccount,
    removeAccount,
    refreshAccounts,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
