import { supabase } from './supabase';
import { clearPhotoUrls } from './photoUrls';

// Sign this device out. supabase-js keeps the session when the logout request
// fails (offline, or a 403 with an empty body from the network edge), which
// would leave a "logged out" phone still signed in. If the session survives,
// forget it locally and reload so the in-memory client starts clean. Returns
// true when it had to reload (callers then stop).
export const signOut = async (): Promise<boolean> => {
  clearPhotoUrls();
  const { error } = await supabase.auth.signOut();
  if (!error) return false;
  const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
  if (!localError) return false;
  try {
    Object.keys(localStorage).filter((k) => /^sb-.+-auth-token(-code-verifier)?$/.test(k)).forEach((k) => localStorage.removeItem(k));
  } catch {
    // Storage unavailable: the reload below still drops the in-memory session.
  }
  window.location.assign('/');
  return true;
};
