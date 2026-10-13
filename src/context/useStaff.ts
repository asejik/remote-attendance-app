import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff } from '../lib/staffAuth';
import { useAuth } from './useAuth';

export interface StaffContext {
  staff: Staff;
  organization: { id: string; name: string; slug: string };
}

const fetchStaffContext = async (userId: string): Promise<StaffContext | null> => {
  const { data } = await supabase
    .from('staff')
    .select('*, organizations(id, name, slug)')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.organizations ? { staff: data, organization: data.organizations } : null;
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
