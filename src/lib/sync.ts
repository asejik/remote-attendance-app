import { supabase } from './supabase';
import { db } from './db'; // This was missing!

export const syncPendingRecords = async () => {
  // 1. Get all pending records from local DB
  const pendingRecords = await db.attendance.where('syncStatus').equals('PENDING').toArray();

  if (pendingRecords.length === 0) {
    return { synced: 0, errors: 0 };
  }

  let syncedCount = 0;
  let errorCount = 0;

  for (const record of pendingRecords) {
    try {
      // 2. Upload Photo to Supabase Storage
      // We use the User ID as a folder name
      const fileName = `${record.userId}/${record.timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('attendance-photos')
        .upload(fileName, record.photoBlob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 3. Get the Public URL of the photo
      const { data: { publicUrl } } = supabase.storage
        .from('attendance-photos')
        .getPublicUrl(fileName);

      // 4. Insert Record into Supabase DB
      const { error: insertError } = await supabase
        .from('attendance_logs')
        .insert({
          user_id: record.userId,
          timestamp: record.timestamp,
          latitude: record.latitude,
          longitude: record.longitude,
          photo_path: publicUrl,
          device_info: { source: 'pwa', version: '1.0' },
          sync_status: 'synced'
        });

      if (insertError) throw insertError;

      // 5. Update Local DB status to SYNCED
      await db.attendance.update(record.id!, { syncStatus: 'SYNCED' });
      syncedCount++;

    } catch (err) {
      console.error('Sync failed for record:', record.id, err);
      errorCount++;
    }
  }

  return { synced: syncedCount, errors: errorCount };
};