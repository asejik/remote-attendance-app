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
      await db.attendance.update(record.id!, { syncStatus: 'SYNCED' });
      syncedCount++;

    } catch (err) {
      console.error('Sync failed for record:', record.id, err);
      errorCount++;
    }
  }

  saveSyncReport(syncedCount, errorCount);
  return { synced: syncedCount, errors: errorCount };
};

const saveSyncReport = (synced: number, errors: number) => {
  try {
    const report: SyncReport = { synced, errors, finishedAt: new Date().toISOString() };
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(report));
  } catch {
    // Diagnostics only; ignore storage failures.
  }
};

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Upload queued records when the network returns, when the app comes back to the
// foreground, and every 5 minutes. Returns a cleanup function.
export const startAutoSync = () => {
  const trigger = () => {
    if (navigator.onLine) syncPendingRecords().catch((err) => console.error('Auto-sync failed', err));
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') trigger();
  };

  window.addEventListener('online', trigger);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(trigger, AUTO_SYNC_INTERVAL_MS);
  trigger();

  return () => {
    window.removeEventListener('online', trigger);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(interval);
  };
};