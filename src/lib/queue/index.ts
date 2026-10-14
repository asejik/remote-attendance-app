import { Capacitor } from '@capacitor/core';
import { createNativeStore } from './nativeStore';
import { createWebStore } from './webStore';
import type { PhotoKind, QueuedEvent, QueuePhotos, QueueStore } from './types';

export type { EventType, QueuedEvent } from './types';

const SYNCED_RETENTION_MS = 30 * 24 * 3600_000;

let store: QueueStore | null = null;
const getStore = () => (store ??= Capacitor.isNativePlatform() ? createNativeStore() : createWebStore());

// Tests swap in a store implementation.
export const setQueueStore = (s: QueueStore) => {
  store = s;
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// UI subscribes to re-read the queue after any change.
export const subscribeQueue = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const byNewest = (a: QueuedEvent, b: QueuedEvent) => b.capturedAt.localeCompare(a.capturedAt);

export const queue = {
  async add(event: QueuedEvent, photos: QueuePhotos) {
    await getStore().add(event, photos);
    notify();
  },
  // Events of one user, newest first.
  async forUser(userId: string) {
    return (await getStore().list()).filter((e) => e.userId === userId).sort(byNewest);
  },
  async pendingForUser(userId: string) {
    return (await this.forUser(userId)).filter((e) => e.status === 'pending').reverse(); // oldest first
  },
  async allPending() {
    return (await getStore().list()).filter((e) => e.status === 'pending').sort(byNewest).reverse();
  },
  async update(id: string, patch: Partial<QueuedEvent>) {
    await getStore().update(id, patch);
    notify();
  },
  getPhoto: (id: string, kind: PhotoKind) => getStore().getPhoto(id, kind),
  // Worker taps "Try again" on a refused record: back in the upload queue.
  async retry(id: string) {
    await getStore().update(id, { status: 'pending', attempts: 0, failReason: undefined });
    notify();
  },
  // After a confirmed upload: drop photos, keep the record for the history list.
  async markSynced(id: string, flags: string[]) {
    await getStore().deletePhotos(id);
    await getStore().update(id, { status: 'synced', syncedAt: new Date().toISOString(), flags, lastError: undefined, failReason: undefined });
    notify();
  },
  // Remove uploaded records older than 30 days (pending and failed ones are never pruned).
  async prune(now = Date.now()) {
    const old = (await getStore().list()).filter(
      (e) => e.status === 'synced' && now - new Date(e.syncedAt ?? e.capturedAt).getTime() > SYNCED_RETENTION_MS,
    );
    for (const e of old) await getStore().remove(e.id);
    if (old.length) notify();
  },
};
