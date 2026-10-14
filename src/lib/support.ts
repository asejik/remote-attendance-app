// Where clients and workers reach the service operator.
export const SUPPORT_EMAIL = 'info@asejik.com';

// Raise PRIVACY_NOTICE_VERSION whenever the notice workers accept changes in
// substance: everyone is asked to accept it again (when online). Version 1 was
// the M3 text; version 2 adds the retention period and the contact.
export const PRIVACY_NOTICE_VERSION = 2;
export const PRIVACY_NOTICE_UPDATED = '14 October 2026';

// Mirrors private.org_accepts_clockins() (migration 20261015100000): after the
// owner suspends an organisation, admins are read-only at once and workers can
// clock in for 7 more days.
const SUSPENSION_GRACE_DAYS = 7;

export interface Suspension {
  graceEnds: Date;
  clockInsBlocked: boolean;
}

export const suspensionOf = (org: { status?: string; suspended_at?: string | null }, now = Date.now()): Suspension | null => {
  if (org.status !== 'suspended') return null;
  const since = org.suspended_at ? new Date(org.suspended_at).getTime() : now;
  const graceEnds = new Date(since + SUSPENSION_GRACE_DAYS * 86_400_000);
  return { graceEnds, clockInsBlocked: now >= graceEnds.getTime() };
};

// Admin writes refused by the database (42501) while suspended get a clear message.
const SUSPENDED_MESSAGE = 'Changes are turned off while the subscription is suspended.';
export const orSuspended = (error: unknown, fallback: string) =>
  (error as { code?: string } | null)?.code === '42501' ? SUSPENDED_MESSAGE : fallback;
