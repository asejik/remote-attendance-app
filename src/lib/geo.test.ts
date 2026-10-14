import { describe, expect, it } from 'vitest';
import { distanceM, outsideSite } from './geo';

describe('distanceM matches the server (private.distance_m)', () => {
  // Reference values computed by the database function on 2026-10-14.
  it.each([
    ['~2 km north', [11.8311, 13.151, 11.8491, 13.151], 2001.50867960213],
    ['two Nigerian cities about 1,000 km apart', [11.8311, 13.151, 8.4966, 4.5421], 1012409.85737249],
    ['a few metres', [6.5244, 3.3792, 6.5245, 3.3793], 15.6744971450371],
  ] as const)('%s', (_label, [a, b, c, d], expected) => {
    expect(distanceM(a, b, c, d)).toBeCloseTo(expected, 3);
  });
});

describe('outsideSite (block mode)', () => {
  const site = { latitude: 11.8311, longitude: 13.151, radius_m: 200 };

  it('is false inside the radius', () => {
    expect(outsideSite({ latitude: 11.8312, longitude: 13.151, accuracyM: 10 }, site)).toBe(false);
  });

  it('is true clearly outside with a precise fix', () => {
    expect(outsideSite({ latitude: 11.8491, longitude: 13.151, accuracyM: 20 }, site)).toBe(true);
  });

  it('does not block on an imprecise fix (the server flags it instead)', () => {
    expect(outsideSite({ latitude: 11.8491, longitude: 13.151, accuracyM: 500 }, site)).toBe(false);
  });
});
