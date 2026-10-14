import { Capacitor } from '@capacitor/core';

// The Android app is installed from an APK file, not a store, so nothing else
// tells workers a new version exists. Release builds know their own version
// (VITE_APP_VERSION, from the git tag) and read `version.json` from the web host
// (VITE_UPDATE_URL): { "latest": "1.2.0", "minimum": "1.0.0", "url": "<APK link>" }.
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

const CACHE_KEY = 'appUpdateInfo';

// Returns what to show, or null when the check doesn't apply (web, test builds)
// or nothing is known. The last answer is cached so the notice survives offline.
export const checkForUpdate = async (): Promise<{ status: UpdateStatus; url: string } | null> => {
  const current = import.meta.env.VITE_APP_VERSION;
  const source = import.meta.env.VITE_UPDATE_URL;
  if (!Capacitor.isNativePlatform() || !isVersion(current) || !source) return null;

  let info: VersionInfo | null = null;
  try {
    const res = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (res.ok) info = parseVersionInfo(await res.json());
    if (info) localStorage.setItem(CACHE_KEY, JSON.stringify(info));
  } catch {
    // Offline or host unreachable: fall back to the last answer.
  }
  if (!info) {
    try {
      info = parseVersionInfo(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'));
    } catch {
      info = null;
    }
  }
  return info ? { status: updateStatus(current, info), url: info.url } : null;
};
