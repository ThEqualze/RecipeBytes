import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AuthUser | null>('/auth/session')
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ): Promise<string | null> => {
    try {
      const u = await api.post<AuthUser>('/auth/signup', {
        email,
        password,
        display_name: displayName,
      });
      setUser(u);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Sign up failed';
    }
  };

  const signIn = async (email: string, password: string): Promise<string | null> => {
    try {
      const u = await api.post<AuthUser>('/auth/login', { email, password });
      setUser(u);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'Sign in failed';
    }
  };

  const signOut = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
