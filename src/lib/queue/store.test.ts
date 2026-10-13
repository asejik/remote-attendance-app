import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueuedEvent, QueueStore } from './types';

// In-memory stand-in for @capacitor/filesystem (paths -> string data).
const files = new Map<string, string>();
vi.mock('@capacitor/filesystem', () => {
  const missing = () => Promise.reject(new Error('File does not exist'));
  return {
    Directory: { Data: 'DATA' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: {
      writeFile: async ({ path, data }: { path: string; data: string }) => {
        files.set(path, data);
        return { uri: path };
      },
      readFile: async ({ path }: { path: string }) => (files.has(path) ? { data: files.get(path)! } : missing()),
      stat: async ({ path }: { path: string }) => ([...files.keys()].some((k) => k.startsWith(`${path}/`)) ? {} : missing()),
      readdir: async ({ path }: { path: string }) => ({
        files: [...new Set([...files.keys()].filter((k) => k.startsWith(`${path}/`)).map((k) => k.slice(path.length + 1).split('/')[0]))].map((name) => ({ name })),
      }),
      deleteFile: async ({ path }: { path: string }) => (files.delete(path) ? undefined : missing()),
      rmdir: async ({ path }: { path: string }) => {
        for (const k of [...files.keys()]) if (k.startsWith(`${path}/`)) files.delete(k);
      },
    },
  };
});

const { createWebStore } = await import('./webStore');
const { createNativeStore } = await import('./nativeStore');

const event = (id: string, overrides: Partial<QueuedEvent> = {}): QueuedEvent => ({
  id, userId: 'user-1', organizationId: 'org-1', staffId: 'staff-1', siteId: 'site-1', siteName: 'Site',
  type: 'CLOCK_IN', capturedAt: '2026-10-14T08:00:00.000Z', latitude: 11.83, longitude: 13.15, accuracyM: 12,
  livenessPassed: true, hasFacePhoto: true, hasSitePhoto: true, status: 'pending', attempts: 0, ...overrides,
});
const jpeg = (text: string) => new Blob([text], { type: 'image/jpeg' });

describe.each([
  ['web (IndexedDB)', createWebStore],
  ['native (Filesystem)', createNativeStore],
])('%s queue store', (_name, create) => {
  let store: QueueStore;
  beforeEach(async () => {
    files.clear();
    store = create();
    for (const e of await store.list()) await store.remove(e.id);
  });

  it('stores an event with both photos and reads them back', async () => {
    await store.add(event('e1'), { face: jpeg('face-bytes'), site: jpeg('site-bytes') });
    expect(await store.list()).toEqual([event('e1')]);
    expect(await (await store.getPhoto('e1', 'face'))!.text()).toBe('face-bytes');
    expect(await (await store.getPhoto('e1', 'site'))!.text()).toBe('site-bytes');
  });

  it('stores an event without a site photo', async () => {
    await store.add(event('e2', { hasSitePhoto: false }), { face: jpeg('f'), site: null });
    expect(await store.getPhoto('e2', 'site')).toBeNull();
  });

  it('updates fields and deletes photos without losing the record', async () => {
    await store.add(event('e3'), { face: jpeg('f'), site: jpeg('s') });
    await store.update('e3', { attempts: 2, lastError: 'Failed to fetch' });
    await store.deletePhotos('e3');
    expect(await store.list()).toEqual([event('e3', { attempts: 2, lastError: 'Failed to fetch' })]);
    expect(await store.getPhoto('e3', 'face')).toBeNull();
  });

  it('removes a record entirely', async () => {
    await store.add(event('e4'), { face: jpeg('f'), site: null });
    await store.remove('e4');
    expect(await store.list()).toEqual([]);
  });
});

describe('native store crash safety', () => {
  it('ignores a record whose event.json was never written (photos only)', async () => {
    files.clear();
    files.set('queue/partial/face.jpg', btoa('f'));
    expect(await createNativeStore().list()).toEqual([]);
  });
});
