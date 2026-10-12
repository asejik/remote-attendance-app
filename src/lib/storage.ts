// Ask the browser not to evict our IndexedDB data (queued clock-ins and photos)
// under storage pressure. Chrome grants this silently for installed/engaged sites.
export const requestPersistentStorage = async (): Promise<boolean> => {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};

export interface StorageInfo {
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export const getStorageInfo = async (): Promise<StorageInfo> => {
  try {
    const [persisted, estimate] = await Promise.all([
      navigator.storage?.persisted?.() ?? Promise.resolve(null),
      navigator.storage?.estimate?.() ?? Promise.resolve(undefined),
    ]);
    return { persisted, usageBytes: estimate?.usage ?? null, quotaBytes: estimate?.quota ?? null };
  } catch {
    return { persisted: null, usageBytes: null, quotaBytes: null };
  }
};
