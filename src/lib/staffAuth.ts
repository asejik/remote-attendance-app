import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Database } from './database.types';

export type Staff = Database['public']['Tables']['staff']['Row'];

const LAST_ORG_KEY = 'lastOrgSlug';

export const getLastOrgSlug = () => {
  try {
    return localStorage.getItem(LAST_ORG_KEY) ?? '';
  } catch {
    return '';
  }
};

// The JSON body of a non-2xx Edge Function response, e.g. { error: 'locked' }.
export const functionError = async (error: unknown): Promise<{ error?: string; [key: string]: unknown }> => {
  if (error instanceof FunctionsHttpError) {
    try {
      return await error.context.json();
    } catch {
      return {};
    }
  }
  return { error: 'network' };
};

const LOGIN_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Organisation, staff code or PIN is not correct.',
  locked: 'Too many wrong PINs. Try again in 15 minutes, or ask your admin to reset your PIN.',
  deactivated: 'This account has been deactivated. Please contact your admin.',
  network: "Can't reach the server. Check your internet connection.",
};

// Worker sign-in through the staff-login Edge Function (PIN checked server-side
// with lockout). On success the returned session is stored like any other.
export const staffLogin = async (org: string, code: string, pin: string): Promise<string | null> => {
  if (!navigator.onLine) return "You're offline. Connect to the internet to log in.";
  const { data, error } = await supabase.functions.invoke('staff-login', {
    body: { org: org.trim().toLowerCase(), code: code.trim(), pin },
  });
  if (error) {
    const body = await functionError(error);
    return LOGIN_MESSAGES[body.error ?? ''] ?? 'Something went wrong. Please try again.';
  }
  const { error: sessionError } = await supabase.auth.setSession(data);
  if (sessionError) return 'Something went wrong. Please try again.';
  try {
    localStorage.setItem(LAST_ORG_KEY, org.trim().toLowerCase());
  } catch {
    // Convenience only.
  }
  return null;
};
