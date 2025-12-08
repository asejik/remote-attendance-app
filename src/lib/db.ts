import Dexie, { type Table } from 'dexie';

export interface LocalAttendanceRecord {
  id?: number;
  userId: string;
  userName?: string; // NEW: Store the name locally
  siteId: string;    // NEW: Store selected site ID
  siteName: string;  // NEW: Store selected site Name
  timestamp: string;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  latitude: number;
  longitude: number;
  photoBlob: Blob;       // Face Photo
  sitePhotoBlob: Blob;   // NEW: Background Photo
  syncStatus: 'PENDING' | 'SYNCED';
}

class RemoteAttendanceDB extends Dexie {
  attendance!: Table<LocalAttendanceRecord>;

  constructor() {
    super('RemoteAttendanceDB');
    // We update the version to 2 because we changed the schema
    this.version(2).stores({
      attendance: '++id, userId, siteId, timestamp, syncStatus'
    });
  }
}

export const db = new RemoteAttendanceDB();

// Updated Helper to save with new fields
export const saveOfflineAttendance = async (
  userId: string,
  userName: string,
  site: { id: string; name: string },
  type: 'CLOCK_IN' | 'CLOCK_OUT',
  coords: { lat: number; lng: number },
  photoBlob: Blob,
  sitePhotoBlob: Blob
) => {
  await db.attendance.add({
    userId,
    userName,
    siteId: site.id,
    siteName: site.name,
    type,
    timestamp: new Date().toISOString(),
    latitude: coords.lat,
    longitude: coords.lng,
    photoBlob,
    sitePhotoBlob,
    syncStatus: 'PENDING'
  });
};

export const getPendingRecords = async () => {
  return await db.attendance.where('syncStatus').equals('PENDING').toArray();
};