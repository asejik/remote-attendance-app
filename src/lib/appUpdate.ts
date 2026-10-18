import { Capacitor } from '@capacitor/core';

// The Android app is installed from an APK file, not a store, so nothing else
// tells workers a new version exists. Release builds know their own version
// (VITE_APP_VERSION, from the git tag) and read `version.json` from the web host
// (VITE_UPDATE_URL): { "latest": "1.2.0", "minimum": "1.0.0", "url": "<APK link>" }.
// Test builds (android.yml) instead know their CI build number (VITE_TEST_BUILD)
// and read the "android-test" GitHub release (VITE_UPDATE_URL is the GitHub API
// link), whose notes start "Build N".
// The check never blocks clock-in: a missed clock-in is worse than an old app.
export interface VersionInfo {
  latest: string;
  minimum: string;
  url: string;
}

export type UpdateStatus = 'none' | 'available' | 'required';

const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10) || 0);

// -1, 0 or 1, comparing dotted numbers ("v1.10.0" > "1.9.3").
export const compareVersions = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
};

const isVersion = (v: unknown): v is string => typeof v === 'string' && /^v?\d+(\.\d+){0,2}$/.test(v);

export const parseVersionInfo = (data: unknown): VersionInfo | null => {
  const d = data as Partial<VersionInfo> | null;
  if (!d || !isVersion(d.latest) || !isVersion(d.minimum) || typeof d.url !== 'string' || !/^https:\/\//.test(d.url)) return null;
  return { latest: d.latest, minimum: d.minimum, url: d.url };
};

export const updateStatus = (current: string, info: VersionInfo): UpdateStatus =>
  compareVersions(current, info.minimum) < 0 ? 'required' : compareVersions(current, info.latest) < 0 ? 'available' : 'none';

export interface TestBuildInfo {
  build: number;
  url: string;
}

const TEST_APK = 'siteproof-test.apk';

// The GitHub API's answer for the android-test release.
export const parseTestRelease = (data: unknown): TestBuildInfo | null => {
  const d = data as { body?: unknown; assets?: { name?: unknown; browser_download_url?: unknown }[] } | null;
  const build = typeof d?.body === 'string' ? /\bBuild (\d+)\b/.exec(d.body)?.[1] : undefined;
  const url = Array.isArray(d?.assets) ? d.assets.find((a) => a?.name === TEST_APK)?.browser_download_url : undefined;
  if (!build || typeof url !== 'string' || !/^https:\/\//.test(url)) return null;
  return { build: Number(build), url };
};

export interface UpdateNotice {
  status: UpdateStatus;
  url: string;
  label: string; // the newer version, as the worker should see it
}

const isTestBuildInfo = (d: unknown): d is TestBuildInfo => {
  const t = d as Partial<TestBuildInfo> | null;
  return !!t && Number.isInteger(t.build) && typeof t.url === 'string' && /^https:\/\//.test(t.url);
};

// Fetch a small JSON file, falling back to the last good answer (stored as
// parsed, read back with fromCache) when offline.
const fetchCached = async <T>(source: string, cacheKey: string, parse: (data: unknown) => T | null, fromCache: (data: unknown) => T | null): Promise<T | null> => {
  try {
    const res = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    const info = res.ok ? parse(await res.json()) : null;
    if (info) {
      localStorage.setItem(cacheKey, JSON.stringify(info));
      return info;
    }
  } catch {
    // Offline, host unreachable or GitHub's hourly limit: use the last answer.
  }
  try {
    return fromCache(JSON.parse(localStorage.getItem(cacheKey) ?? 'null'));
  } catch {
    return null;
  }
};

// Returns what to show, or null when the check doesn't apply (web, local builds)
// or nothing is known. The last answer is cached so the notice survives offline.
export const checkForUpdate = async (): Promise<UpdateNotice | null> => {
  const source = import.meta.env.VITE_UPDATE_URL;
  if (!Capacitor.isNativePlatform() || !source) return null;

  const testBuild = Number.parseInt(import.meta.env.VITE_TEST_BUILD ?? '', 10);
  if (testBuild > 0) {
    const info = await fetchCached(source, 'appUpdateTestBuild', parseTestRelease, (d) => (isTestBuildInfo(d) ? d : null));
    return info ? { status: info.build > testBuild ? 'available' : 'none', url: info.url, label: `build ${info.build}` } : null;
  }

  const current = import.meta.env.VITE_APP_VERSION;
  if (!isVersion(current)) return null;
  const info = await fetchCached(source, 'appUpdateInfo', parseVersionInfo, parseVersionInfo);
  return info ? { status: updateStatus(current, info), url: info.url, label: info.latest.replace(/^v/, '') } : null;
};

// "Later" hides the notice until a newer version than the dismissed one appears.
const DISMISSED_KEY = 'appUpdateDismissed';
export const isDismissed = (notice: UpdateNotice) => {
  try {
    return notice.status === 'available' && localStorage.getItem(DISMISSED_KEY) === notice.label;
  } catch {
    return false;
  }
};
export const dismiss = (notice: UpdateNotice) => {
  try {
    localStorage.setItem(DISMISSED_KEY, notice.label);
  } catch {
    // Storage blocked: it just shows again next time.
  }
};
