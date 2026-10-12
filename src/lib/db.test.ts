import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getPendingRecords, saveOfflineAttendance } from './db';

const site = { id: 'site-1', name: 'Test Site' };
const coords = { lat: 11.8311, lng: 13.151 };
const photo = () => new Blob(['jpeg'], { type: 'image/jpeg' });

describe('offline attendance queue', () => {
  beforeEach(async () => {
    await db.attendance.clear();
  });

  it('saves a clock-in as PENDING and returns it from the pending queue', async () => {
    await saveOfflineAttendance('user-1', 'Test User', site, 'CLOCK_IN', coords, photo(), photo());

    const pending = await getPendingRecords();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      userId: 'user-1',
      siteId: 'site-1',
      siteName: 'Test Site',
      type: 'CLOCK_IN',
      latitude: coords.lat,
      longitude: coords.lng,
      syncStatus: 'PENDING',
    });
  });

  it('excludes records already marked SYNCED', async () => {
    await saveOfflineAttendance('user-1', 'Test User', site, 'CLOCK_IN', coords, photo(), photo());
    const [record] = await getPendingRecords();
    await db.attendance.update(record.id!, { syncStatus: 'SYNCED' });

    expect(await getPendingRecords()).toHaveLength(0);
  });
});
