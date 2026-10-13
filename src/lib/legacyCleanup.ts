import Dexie from 'dexie';

// One-time removal of the prototype's on-device data (its offline queue and
// caches). Only test data ever lived there (decision in M4).
export const removeLegacyDeviceData = async () => {
  try {
    if (localStorage.getItem('legacyCleanupDone')) return;
    await Dexie.delete('RemoteAttendanceDB');
    for (const key of Object.keys(localStorage)) {
      if (key === 'sitesCache' || key.startsWith('role:')) localStorage.removeItem(key);
    }
    localStorage.setItem('legacyCleanupDone', '1');
  } catch (err) {
    console.error('Legacy cleanup failed', err);
  }
};
