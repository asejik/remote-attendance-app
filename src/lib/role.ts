import { supabase } from './supabase';

export type Role = 'admin' | 'staff';

const cacheKey = (userId: string) => `role:${userId}`;

const readCachedRole = (userId: string): Role | null => {
  try {
    const value = localStorage.getItem(cacheKey(userId));
    return value === 'admin' || value === 'staff' ? value : null;
  } catch {
    return null;
  }
};

// Look up the user's role on the server and remember it on the device, so the
// app can route a returning user while offline. Offline with nothing cached,
// fall back to 'staff': admin screens need the network anyway.
export const getRole = async (userId: string): Promise<Role> => {
  const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
  if (!error && data) {
    const role: Role = data.role === 'admin' ? 'admin' : 'staff';
    try {
      localStorage.setItem(cacheKey(userId), role);
    } catch {
      // Cache is a convenience; ignore storage failures.
    }
    return role;
  }
  return readCachedRole(userId) ?? 'staff';
};
