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

// Wrong PIN: how many tries are left. Locked: until when (the same for staff
// codes that don't exist, so this reveals nothing about which codes are real).
const loginMessage = (body: { error?: string; attempts_left?: unknown; locked_until?: unknown }) => {
  if (body.error === 'invalid_credentials' && typeof body.attempts_left === 'number') {
    const left = body.attempts_left;
    return `Organisation, staff code or PIN is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left before this account is locked.`;
  }
  if (body.error === 'locked' && typeof body.locked_until === 'string') {
    const until = new Date(body.locked_until);
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    const time = until.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const wait = minutes >= 120 ? `${Math.round(minutes / 60)} hours` : minutes >= 60 ? 'about an hour' : `about ${minutes} minutes`;
    return `This account is locked after too many wrong PINs. Try again after ${time} (${wait}), or ask your admin to reset your PIN to unlock it now.`;
  }
  return LOGIN_MESSAGES[body.error ?? ''] ?? 'Something went wrong. Please try again.';
};

const LOGIN_MESSAGES: Record<string, string> = {
  // The server gives the same answer for a wrong PIN and a locked account (so
  // lockouts can't reveal staff codes); the hint covers both.
  invalid_credentials: 'Organisation, staff code or PIN is not correct. After 5 wrong tries the account is locked for a while: wait, or ask your admin to reset your PIN.',
  too_many_attempts: 'Too many failed logins from this network. Please wait 15 minutes and try again.',
  locked: 'Too many wrong PINs. Try again in 15 minutes, or ask your admin to reset your PIN.', // older server versions
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
    return loginMessage(await functionError(error));
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
