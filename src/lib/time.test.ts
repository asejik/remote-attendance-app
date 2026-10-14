import { describe, expect, it } from 'vitest';
import { timeAgo } from './time';

describe('timeAgo', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const at = (ms: number) => new Date(now - ms).toISOString();
  it('rounds down to minutes, hours and days', () => {
    expect(timeAgo(at(20_000), now)).toBe('less than a minute');
    expect(timeAgo(at(5 * 60_000 + 59_000), now)).toBe('5 min');
    expect(timeAgo(at(3 * 3_600_000 + 1), now)).toBe('3 h');
    expect(timeAgo(at(26 * 3_600_000), now)).toBe('1 day');
    expect(timeAgo(at(50 * 3_600_000), now)).toBe('2 days');
  });
  it('never goes negative when the phone clock is behind', () => {
    expect(timeAgo(at(-60_000), now)).toBe('less than a minute');
  });
});
