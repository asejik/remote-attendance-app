import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff } from '../lib/staffAuth';
import { useAuth } from './useAuth';

export interface StaffContext {
  staff: Staff;
  // status/suspended_at may be missing from contexts cached before they existed.
  organization: { id: string; name: string; slug: string; timezone: string; status?: string; suspended_at?: string | null };
}

const cacheKey = (userId: string) => `staffContext:${userId}`;

// Online: the server's answer (cached for offline use; a definite "no active
// record" clears the cache). Offline / network error: the last cached answer,
// so a signed-in worker can still open the app and clock in. The server still
// enforces access on upload.
const fetchStaffContext = async (userId: string): Promise<StaffContext | null> => {
  const { data, error } = await supabase
    .from('staff')
    .select('*, organizations(id, name, slug, timezone, status, suspended_at)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    try {
      const cached = localStorage.getItem(cacheKey(userId));
      return cached ? (JSON.parse(cached) as StaffContext) : null;
    } catch {
      return null;
    }
  }
  const context = data?.organizations ? { staff: data, organization: data.organizations } : null;
  try {
    if (context) localStorage.setItem(cacheKey(userId), JSON.stringify(context));
    else localStorage.removeItem(cacheKey(userId));
  } catch {
    // Cache is a convenience.
  }
  return context;
};

// The signed-in user's own active staff record (new schema) and organisation.
// `context` is null when signed out or not an active staff member.
export const useStaff = () => {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<{ userId: string; context: StaffContext | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchStaffContext(user.id).then((context) => {
      if (!cancelled) setLoaded({ userId: user.id, context });
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Re-read after changes (e.g. accepting the privacy notice).
  const reload = useCallback(async () => {
    if (!user) return;
    setLoaded({ userId: user.id, context: await fetchStaffContext(user.id) });
  }, [user]);

  const current = user && loaded?.userId === user.id ? loaded : null;
  return { context: current?.context ?? null, loading: Boolean(user) && !current, reload };
};
