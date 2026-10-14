import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersionInfo, updateStatus } from './appUpdate';

const info = { latest: '1.3.0', minimum: '1.1.0', url: 'https://example.test/attendance.apk' };

describe('app update check', () => {
  it('compares dotted versions numerically, with or without a leading v', () => {
    expect(compareVersions('v1.10.0', '1.9.3')).toBe(1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('v1.0.0', 'v1.0.1')).toBe(-1);
  });

  it('says required below the minimum, available below the latest, otherwise nothing', () => {
    expect(updateStatus('v1.0.9', info)).toBe('required');
    expect(updateStatus('v1.1.0', info)).toBe('available');
    expect(updateStatus('v1.3.0', info)).toBe('none');
    expect(updateStatus('v1.4.0', info)).toBe('none');
  });

  it('accepts only well-formed version files with an https download link', () => {
    expect(parseVersionInfo(info)).toEqual(info);
    expect(parseVersionInfo({ ...info, url: 'http://example.test/a.apk' })).toBeNull();
    expect(parseVersionInfo({ ...info, latest: 'soon' })).toBeNull();
    expect(parseVersionInfo(null)).toBeNull();
  });
});
