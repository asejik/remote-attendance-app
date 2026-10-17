import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Admin two-step login (TOTP via Supabase MFA). The database grants admin power
// only to AAL2 sessions (migration 20261015150000); these helpers get there.

// Assurance level of a session, read from its token ('aal1' = password only).
export const sessionAal = (session: Session | null): string | null => {
  if (!session) return null;
  try {
    const part = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))) as { aal?: string }).aal ?? 'aal1';
  } catch {
    return 'aal1';
  }
};

// The admin's confirmed authenticator, if they have set one up.
export const verifiedTotpFactor = async () => {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.find((f) => f.status === 'verified') ?? null;
};

// New authenticator: removes any half-finished set-up first, then returns the
// QR code (an SVG data URL) and the secret to type in by hand.
export const startTotpEnrolment = async () => {
  const { data: list, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) throw listError;
  for (const f of list.all.filter((x) => x.factor_type === 'totp' && x.status === 'unverified')) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app', issuer: 'SiteProof' });
  if (error) throw error;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
};

// Checks a 6-digit code; on success the session becomes AAL2. Supabase refuses
// the check if its two requests (challenge, verify) arrive from different IP
// addresses, which happens on some networks; a fresh attempt usually succeeds.
export const verifyTotp = async (factorId: string, code: string) => {
  let { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  for (let retry = 0; error?.code === 'mfa_ip_address_mismatch' && retry < 2; retry++) {
    ({ error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() }));
  }
  return error ? (error.code === 'mfa_verification_failed' || /invalid/i.test(error.message) ? 'That code is not correct. Check the app and try again.' : 'Could not check the code. Please try again.') : null;
};
