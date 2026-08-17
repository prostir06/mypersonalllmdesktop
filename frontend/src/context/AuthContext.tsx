/**
 * Auth context: short access JWT in memory + silent refresh via httpOnly cookie.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserProfile } from '../types/api';
import { authAPI } from '../services/api';
import { getAccessToken, setAccessToken } from '../services/authToken';

export type AuthContextValue = {
  token: string | null;
  user: UserProfile | null;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  login: (newToken: string) => void;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  /** False until boot refresh attempt finishes. */
  authReady: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await authAPI.refresh();
        if (cancelled) return;
        setAccessToken(data.token);
        setToken(data.token);
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((newToken: string) => {
    setAccessToken(newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      // Server may already be unreachable — still clear local session.
      console.warn('Logout request failed:', err);
    }
    setAccessToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: token ?? getAccessToken(),
      user,
      setUser,
      login,
      logout,
      isAuthenticated: Boolean(token ?? getAccessToken()),
      authReady,
    }),
    [token, user, login, logout, authReady]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
