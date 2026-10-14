import { describe, expect, it } from 'vitest';
import { suspensionOf } from './support';

const DAY = 86_400_000;

describe('organisation suspension', () => {
  it('is nothing while active (including old cached records without a status)', () => {
    expect(suspensionOf({ status: 'active' })).toBeNull();
    expect(suspensionOf({})).toBeNull();
  });

  it('allows clock-ins for 7 days after suspension, then blocks them', () => {
    const at = Date.UTC(2026, 9, 1);
    const org = { status: 'suspended', suspended_at: new Date(at).toISOString() };
    expect(suspensionOf(org, at + 6 * DAY)).toEqual({ graceEnds: new Date(at + 7 * DAY), clockInsBlocked: false });
    expect(suspensionOf(org, at + 7 * DAY)?.clockInsBlocked).toBe(true);
  });
});
