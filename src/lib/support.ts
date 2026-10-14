// Where clients and workers reach the service operator.
export const SUPPORT_EMAIL = 'info@asejik.com';

// Mirrors private.org_accepts_clockins() (migration 20261015100000): after the
// owner suspends an organisation, admins are read-only at once and workers can
// clock in for 7 more days.
export const SUSPENSION_GRACE_DAYS = 7;

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
export const SUSPENDED_MESSAGE = 'Changes are turned off while the subscription is suspended.';
export const orSuspended = (error: unknown, fallback: string) =>
  (error as { code?: string } | null)?.code === '42501' ? SUSPENDED_MESSAGE : fallback;
