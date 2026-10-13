import Dexie, { type Table } from 'dexie';
import type { PhotoKind, QueuedEvent, QueuePhotos, QueueStore } from './types';

interface PhotoRow {
  key: string; // `${eventId}:${kind}`
  blob: Blob;
}

class QueueDB extends Dexie {
  events!: Table<QueuedEvent, string>;
  photos!: Table<PhotoRow, string>;

  constructor() {
    super('AttendanceQueue');
    this.version(1).stores({
      events: 'id, userId, status, capturedAt',
      photos: 'key',
    });
  }
}

// Browser (IndexedDB) storage for the web app. The service worker setup asks
// the browser to keep this storage persistent.
export const createWebStore = (): QueueStore => {
  const db = new QueueDB();
  const photoKey = (id: string, kind: PhotoKind) => `${id}:${kind}`;

  return {
    async add(event: QueuedEvent, photos: QueuePhotos) {
      await db.transaction('rw', db.events, db.photos, async () => {
        if (photos.face) await db.photos.put({ key: photoKey(event.id, 'face'), blob: photos.face });
        if (photos.site) await db.photos.put({ key: photoKey(event.id, 'site'), blob: photos.site });
        await db.events.put(event);
      });
    },
    list: () => db.events.toArray(),
    async update(id, patch) {
      await db.events.update(id, patch);
    },
    async getPhoto(id, kind) {
      return (await db.photos.get(photoKey(id, kind)))?.blob ?? null;
    },
    async deletePhotos(id) {
      await db.photos.bulkDelete([photoKey(id, 'face'), photoKey(id, 'site')]);
    },
    async remove(id) {
      await db.transaction('rw', db.events, db.photos, async () => {
        await db.photos.bulkDelete([photoKey(id, 'face'), photoKey(id, 'site')]);
        await db.events.delete(id);
      });
    },
  };
};
