import Dexie, { type Table } from 'dexie';

// 1. Define the shape of our Attendance Record
export interface LocalAttendanceRecord {
  id?: number; // Auto-incrementing ID for local usage
  userId: string;
  timestamp: string; // ISO String
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  latitude: number;
  longitude: number;
  photoBlob: Blob; // We store the actual image data locally!
  syncStatus: 'PENDING' | 'SYNCED';
  onlineId?: string; // The ID from Supabase once synced
}

// 2. Define the Database Class
class RemoteAttendanceDB extends Dexie {
  attendance!: Table<LocalAttendanceRecord>;

  constructor() {
    super('RemoteAttendanceDB');

    // Define tables and indexes
    // '++id' means auto-increment primary key
    // 'userId' and 'syncStatus' are indexed for fast searching
    this.version(1).stores({
      attendance: '++id, userId, timestamp, syncStatus'
    });
  }
}

// 3. Export the initialized database
export const db = new RemoteAttendanceDB();

// 4. Helper function to save a new record
export const saveOfflineAttendance = async (
  userId: string,
  type: 'CLOCK_IN' | 'CLOCK_OUT',
  coords: { lat: number; lng: number },
  photoBlob: Blob
) => {
  await db.attendance.add({
    userId,
    type,
    timestamp: new Date().toISOString(),
    latitude: coords.lat,
    longitude: coords.lng,
    photoBlob,
    syncStatus: 'PENDING'
  });
};

// 5. Helper to get pending items (for the Sync engine later)
export const getPendingRecords = async () => {
  return await db.attendance.where('syncStatus').equals('PENDING').toArray();
};