import React, { useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthContext } from './authContextDef';
import { clearStaffCache } from './useStaff';
import { sessionAal } from '../lib/mfa';
import { signOut as signOutDevice } from '../lib/signOut';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. Listen for changes (login, logout, auto-refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') clearStaffCache();
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await signOutDevice();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, aal: sessionAal(session), signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};