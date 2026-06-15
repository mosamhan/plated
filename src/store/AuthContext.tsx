import { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState } from 'react';

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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  // Mock fallback flag for when no backend is configured (keeps the repo runnable).
  const [mockSignedIn, setMockSignedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email?: string, password?: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      setMockSignedIn(true);
      return {};
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email ?? '',
      password: password ?? '',
    });
    return error ? { error: error.message } : {};
  };

  const signUp = async (input: SignUpInput): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      setMockSignedIn(true);
      return {};
    }
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        // Read by the handle_new_user() DB trigger to seed the profile row.
        data: { name: input.name, handle: input.handle.replace(/^@/, '') },
      },
    });
    if (error) return { error: error.message };
    return { needsConfirmation: !data.session };
  };

  const signOut = async () => {
    if (!isSupabaseConfigured) {
      setMockSignedIn(false);
      return;
    }
    await supabase.auth.signOut();
  };

  const value: AuthContextValue = {
    signedIn: isSupabaseConfigured ? !!session : mockSignedIn,
    loading,
    userId: session?.user.id ?? null,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
