import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  aal: string | null; // 'aal2' once an admin has entered their two-step code
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({ user: null, session: null, loading: true, aal: null, signOut: async () => {} });
