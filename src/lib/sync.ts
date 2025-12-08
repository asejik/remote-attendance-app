import { supabase } from './supabase';
import { db } from './db';

export const syncPendingRecords = async () => {
  const pendingRecords = await db.attendance.where('syncStatus').equals('PENDING').toArray();
  if (pendingRecords.length === 0) return { synced: 0, errors: 0 };

  let syncedCount = 0;
  let errorCount = 0;

  for (const record of pendingRecords) {
    try {
      const timestamp = record.timestamp.replace(/[:.]/g, '-'); // Safe filename

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

      // 3. Get Public URLs
      const { data: { publicUrl: faceUrl } } = supabase.storage.from('attendance-photos').getPublicUrl(facePath);
      const { data: { publicUrl: siteUrl } } = supabase.storage.from('attendance-photos').getPublicUrl(sitePath);

      // 4. Insert Record
      const { error: insertError } = await supabase.from('attendance_logs').insert({
        user_id: record.userId,
        site_id: record.siteId,          // NEW
        site_name_snapshot: record.siteName, // NEW
        timestamp: record.timestamp,
        latitude: record.latitude,
        longitude: record.longitude,
        photo_path: faceUrl,
        site_photo_path: siteUrl,        // NEW
        device_info: { source: 'pwa', version: '2.0' },
        sync_status: 'synced'
      });

      if (insertError) throw insertError;

      // 5. Update Local Status
      await db.attendance.update(record.id!, { syncStatus: 'SYNCED' });
      syncedCount++;

    } catch (err) {
      console.error('Sync failed for record:', record.id, err);
      errorCount++;
    }
  }

  return { synced: syncedCount, errors: errorCount };
};