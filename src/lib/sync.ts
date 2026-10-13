import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { supabase } from './supabase';
import { db } from './db';

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

const runSync = async () => {
  const pendingRecords = await db.attendance.where('syncStatus').equals('PENDING').toArray();
  if (pendingRecords.length === 0) {
    saveSyncReport(0, 0);
    return { synced: 0, errors: 0 };
  }

  let syncedCount = 0;
  let errorCount = 0;

  for (const record of pendingRecords) {
    try {
      const timestamp = record.timestamp.replace(/[:.]/g, '-');

      // 1. Upload FACE Photo
      const facePath = `${record.userId}/face_${timestamp}.jpg`;
      const { error: faceErr } = await supabase.storage
        .from('attendance-photos')
        .upload(facePath, record.photoBlob, { upsert: true });
      if (faceErr) throw faceErr;

      // 2. Upload SITE Photo
      const sitePath = `${record.userId}/site_${timestamp}.jpg`;
      const { error: siteErr } = await supabase.storage
        .from('attendance-photos')
        .upload(sitePath, record.sitePhotoBlob, { upsert: true });
      if (siteErr) throw siteErr;

      const { data: { publicUrl: faceUrl } } = supabase.storage.from('attendance-photos').getPublicUrl(facePath);
      const { data: { publicUrl: siteUrl } } = supabase.storage.from('attendance-photos').getPublicUrl(sitePath);

      // 3. Insert Record
      const { error: insertError } = await supabase.from('attendance_logs').insert({
        user_id: record.userId,
        site_id: record.siteId,
        site_name_snapshot: record.siteName,

        // --- THE FIX IS HERE ---
        type: record.type, // We must explicitly send the type (CLOCK_IN / CLOCK_OUT)
        // -----------------------

        timestamp: record.timestamp,
        latitude: record.latitude,
        longitude: record.longitude,
        photo_path: faceUrl,
        site_photo_path: siteUrl,
        device_info: { source: 'pwa', version: '2.2' },
        sync_status: 'synced'
      });

      if (insertError) throw insertError;

      // 4. Update Local DB status
      await db.attendance.update(record.id!, { syncStatus: 'SYNCED', lastError: undefined });
      syncedCount++;

    } catch (err) {
      console.error('Sync failed for record:', record.id, err);
      await db.attendance.update(record.id!, { attempts: (record.attempts ?? 0) + 1, lastError: errorMessage(err) });
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

const hasPending = async () => (await db.attendance.where('syncStatus').equals('PENDING').count()) > 0;

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
