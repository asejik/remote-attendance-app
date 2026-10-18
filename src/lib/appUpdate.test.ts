import { describe, expect, it } from 'vitest';
import { compareVersions, parseTestRelease, parseVersionInfo, updateStatus } from './appUpdate';

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

describe('test build update check', () => {
  const release = {
    body: 'Build 142. Test build from abc1234 (2026-10-18 10:00 UTC). Talks to the dev database.',
    assets: [
      { name: 'other.zip', browser_download_url: 'https://github.com/x/other.zip' },
      { name: 'siteproof-test.apk', browser_download_url: 'https://github.com/x/siteproof-test.apk' },
    ],
  };

  it('reads the build number and the APK link from the GitHub release', () => {
    expect(parseTestRelease(release)).toEqual({ build: 142, url: 'https://github.com/x/siteproof-test.apk' });
  });

  it('ignores releases without a build number or the test APK', () => {
    expect(parseTestRelease({ ...release, body: 'Test build from abc1234.' })).toBeNull();
    expect(parseTestRelease({ ...release, assets: [release.assets[0]] })).toBeNull();
    expect(parseTestRelease({ ...release, assets: [{ name: 'siteproof-test.apk', browser_download_url: 'http://x/a.apk' }] })).toBeNull();
    expect(parseTestRelease({ message: 'API rate limit exceeded' })).toBeNull();
    expect(parseTestRelease(null)).toBeNull();
  });
});
