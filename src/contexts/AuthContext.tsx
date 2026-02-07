import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Effect } from "effect";
import { FirebaseAuthService, runWithAppLayer } from "../lib/effect";
import type { AppUser } from "../types";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<AppUser>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Map Firebase/auth errors to user-friendly login messages */
function getLoginErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/auth\/wrong-password|auth\/invalid-credential|auth\/invalid-login-credentials/.test(msg))
    return "Incorrect email or password. Please check your details and try again.";
  if (/auth\/user-not-found/.test(msg))
    return "No account found with this email. Please check the address or sign up.";
  if (/auth\/invalid-email/.test(msg))
    return "Please enter a valid email address.";
  if (/auth\/too-many-requests/.test(msg))
    return "Too many failed attempts. Please try again later or reset your password.";
  if (/auth\/user-disabled/.test(msg))
    return "This account has been disabled. Contact support.";
  if (msg && msg.trim()) return msg;
  return "Sign in failed. Please check your email and password and try again.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (email: string, password: string): Promise<AppUser> => {
    setError(null);
    const program = Effect.gen(function* () {
      const auth = yield* FirebaseAuthService;
      return yield* auth.signIn(email, password);
    });
    const run = runWithAppLayer(program);
    try {
      const u = await Effect.runPromise(run);
      setUser(u);
      return u;
    } catch (e) {
      setError(getLoginErrorMessage(e));
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    const program = Effect.gen(function* () {
      const auth = yield* FirebaseAuthService;
      return yield* auth.signOut();
    });
    const run = runWithAppLayer(program);
    await Effect.runPromise(run);
    setUser(null);
  }, []);

  useEffect(() => {
    const program = Effect.gen(function* () {
      const auth = yield* FirebaseAuthService;
      return yield* auth.subscribeAuth((u) => {
        setUser(u);
        setLoading(false);
      });
    });
    const run = runWithAppLayer(program);
    let unsub: (() => void) | undefined;
    Effect.runPromise(run)
      .then((u) => {
        unsub = u;
      })
      .catch(() => {
        setLoading(false);
      });
    return () => {
      unsub?.();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    signIn,
    signOut,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
