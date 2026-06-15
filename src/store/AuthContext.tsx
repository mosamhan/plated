import { createContext, useContext, useState } from 'react';

interface AuthContextValue {
  signedIn: boolean;
  signIn: () => void;
  signUp: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);

  const value: AuthContextValue = {
    signedIn,
    signIn: () => setSignedIn(true),
    signUp: () => setSignedIn(true),
    signOut: () => setSignedIn(false),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
