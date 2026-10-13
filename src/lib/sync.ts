import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { supabase } from './supabase';
import { queue, type QueuedEvent } from './queue';

export interface SyncReport {
  synced: number;
  errors: number;
  finishedAt: string;
}

const LAST_SYNC_KEY = 'lastSyncReport';
let inFlight: Promise<{ synced: number; errors: number }> | null = null;

export const getLastSyncReport = (): SyncReport | null => {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    return raw ? (JSON.parse(raw) as SyncReport) : null;
  } catch {
    return null;
  }
};

// Single-flight: the manual button, the online event and the timer can all fire
// at once; they share one run instead of uploading the same records twice.
export const syncPendingRecords = () => {
  if (!inFlight) {
    inFlight = runSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};

const isDuplicate = (error: unknown) => {
  const e = error as { statusCode?: string | number; message?: string };
  return String(e?.statusCode) === '409' || /already exists|duplicate/i.test(e?.message ?? '');
};

// Uploads one photo to event-photos/{org}/{event}/{kind}.jpg. "Already exists"
// means an earlier attempt got this far, which counts as success. A photo
// missing from the device is skipped; the server then flags the event.
const uploadPhoto = async (event: QueuedEvent, kind: 'face' | 'site') => {
  const blob = await queue.getPhoto(event.id, kind);
  if (!blob) return null;
  const path = `${event.organizationId}/${event.id}/${kind}.jpg`;
  const { error } = await supabase.storage.from('event-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error && !isDuplicate(error)) throw error;
  return path;
};

const uploadEvent = async (event: QueuedEvent) => {
  const facePath = event.hasFacePhoto ? await uploadPhoto(event, 'face') : null;
  const sitePath = event.hasSitePhoto ? await uploadPhoto(event, 'site') : null;
  const { error } = await supabase.from('attendance_events').upsert({
    id: event.id,
    organization_id: event.organizationId,
    staff_id: event.staffId,
    site_id: event.siteId,
    type: event.type,
    captured_at: event.capturedAt,
    latitude: event.latitude,
    longitude: event.longitude,
    accuracy_m: event.accuracyM,
    liveness_passed: event.livenessPassed,
    face_photo_path: facePath,
    site_photo_path: sitePath,
    device_info: { app_version: __APP_VERSION__, platform: Capacitor.getPlatform() },
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
  const { data } = await supabase.from('attendance_events').select('flags').eq('id', event.id).maybeSingle();
  await queue.markSynced(event.id, data?.flags ?? []);
};

// Uploads the signed-in user's waiting records, oldest first. Records of other
// users on a shared device wait until that user signs in.
const runSync = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const pending = session ? await queue.pendingForUser(session.user.id) : [];
  let syncedCount = 0;
  let errorCount = 0;

  for (const event of pending) {
    try {
      await uploadEvent(event);
      syncedCount++;
    } catch (err) {
      console.error('Sync failed for record:', event.id, err);
      await queue.update(event.id, { attempts: event.attempts + 1, lastError: errorMessage(err) });
      errorCount++;
    }
  }

  saveSyncReport(syncedCount, errorCount);
  return { synced: syncedCount, errors: errorCount };
};

// Supabase returns plain { message } objects as well as Error instances.
const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message
    : typeof err === 'object' && err !== null && 'message' in err ? String(err.message)
    : String(err);

const saveSyncReport = (synced: number, errors: number) => {
  try {
    const report: SyncReport = { synced, errors, finishedAt: new Date().toISOString() };
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(report));
  } catch {
    // Diagnostics only; ignore storage failures.
  }
};

// Android reports "online" a moment before requests actually get through.
const ONLINE_SETTLE_MS = 3_000;
// Safety net: while records are waiting, check this often regardless of events
// (the Android WebView does not reliably fire "online").
const PENDING_CHECK_MS = 30_000;
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000, 300_000];

export type SyncTriggerReason = 'app start' | 'back online' | 'app reopened' | 'pending check' | 'retry';

export interface SyncTrigger {
  reason: SyncTriggerReason;
  at: string;
}

const LAST_TRIGGER_KEY = 'lastSyncTrigger';

export const getLastSyncTrigger = (): SyncTrigger | null => {
  try {
    const raw = localStorage.getItem(LAST_TRIGGER_KEY);
    return raw ? (JSON.parse(raw) as SyncTrigger) : null;
  } catch {
    return null;
  }
};

const saveSyncTrigger = (reason: SyncTriggerReason) => {
  try {
    localStorage.setItem(LAST_TRIGGER_KEY, JSON.stringify({ reason, at: new Date().toISOString() }));
  } catch {
    // Diagnostics only; ignore storage failures.
  }
};

// Delay before the next try after `failedRuns` consecutive runs with failures.
export const retryDelayMs = (failedRuns: number) =>
  RETRY_DELAYS_MS[Math.min(Math.max(failedRuns, 1), RETRY_DELAYS_MS.length) - 1];

const hasPending = async () => (await queue.allPending()).length > 0;

// Upload queued records on app start, when the network returns, when the app
// comes back to the foreground, and every 30 s while anything is waiting; after
// a failure, retry with backoff. Returns a cleanup function.
export const startAutoSync = () => {
  let failedRuns = 0;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let onlineTimer: ReturnType<typeof setTimeout> | undefined;

  const trigger = async (reason: SyncTriggerReason) => {
    if (stopped || !navigator.onLine) return;
    clearTimeout(retryTimer);
    saveSyncTrigger(reason);
    try {
      const { errors } = await syncPendingRecords();
      failedRuns = errors > 0 ? failedRuns + 1 : 0;
    } catch (err) {
      console.error('Auto-sync failed', err);
      failedRuns++;
    }
    if (failedRuns > 0 && !stopped) retryTimer = setTimeout(() => trigger('retry'), retryDelayMs(failedRuns));
  };
  const onOnline = () => {
    clearTimeout(onlineTimer);
    onlineTimer = setTimeout(() => trigger('back online'), ONLINE_SETTLE_MS);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') trigger('app reopened');
  };
  // Backoff owns the schedule after a failure; otherwise only act if something waits.
  const pendingCheck = async () => {
    if (failedRuns === 0 && (await hasPending())) trigger('pending check');
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const networkListener = Capacitor.isNativePlatform()
    ? Network.addListener('networkStatusChange', (status) => {
        if (status.connected) onOnline();
      })
    : undefined;
  const interval = setInterval(pendingCheck, PENDING_CHECK_MS);
  trigger('app start');

  return () => {
    stopped = true;
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    networkListener?.then((listener) => listener.remove());
    clearInterval(interval);
    clearTimeout(retryTimer);
    clearTimeout(onlineTimer);
  };
};
