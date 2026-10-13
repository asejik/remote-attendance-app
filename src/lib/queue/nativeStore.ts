import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { PhotoKind, QueuedEvent, QueuePhotos, QueueStore } from './types';

// Android/iOS storage: files in the app's private data directory, which only an
// uninstall or "Clear data" removes (WebView storage can't be made persistent).
// Layout: queue/{id}/face.jpg, queue/{id}/site.jpg, queue/{id}/event.json.
// event.json is written last, so a record only exists once its photos do.
const ROOT = 'queue';
const dir = Directory.Data;

const blobToBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const base64ToBlob = (data: string) => {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
};

const exists = async (path: string) => {
  try {
    await Filesystem.stat({ path, directory: dir });
    return true;
  } catch {
    return false;
  }
};

const readEvent = async (id: string): Promise<QueuedEvent | null> => {
  try {
    const { data } = await Filesystem.readFile({ path: `${ROOT}/${id}/event.json`, directory: dir, encoding: Encoding.UTF8 });
    return JSON.parse(data as string) as QueuedEvent;
  } catch {
    return null; // incomplete write or already removed
  }
};

const writeEvent = (event: QueuedEvent) =>
  Filesystem.writeFile({
    path: `${ROOT}/${event.id}/event.json`, directory: dir, encoding: Encoding.UTF8,
    data: JSON.stringify(event), recursive: true,
  });

export const createNativeStore = (): QueueStore => ({
  async add(event: QueuedEvent, photos: QueuePhotos) {
    for (const kind of ['face', 'site'] as const) {
      const blob = photos[kind];
      if (blob) {
        await Filesystem.writeFile({ path: `${ROOT}/${event.id}/${kind}.jpg`, directory: dir, data: await blobToBase64(blob), recursive: true });
      }
    }
    await writeEvent(event);
  },
  async list() {
    if (!(await exists(ROOT))) return [];
    const { files } = await Filesystem.readdir({ path: ROOT, directory: dir });
    const events = await Promise.all(files.map((f) => readEvent(f.name)));
    return events.filter((e): e is QueuedEvent => e !== null);
  },
  async update(id, patch) {
    const event = await readEvent(id);
    if (event) await writeEvent({ ...event, ...patch });
  },
  async getPhoto(id: string, kind: PhotoKind) {
    try {
      const { data } = await Filesystem.readFile({ path: `${ROOT}/${id}/${kind}.jpg`, directory: dir });
      return typeof data === 'string' ? base64ToBlob(data) : data;
    } catch {
      return null;
    }
  },
  async deletePhotos(id) {
    for (const kind of ['face', 'site'] as const) {
      await Filesystem.deleteFile({ path: `${ROOT}/${id}/${kind}.jpg`, directory: dir }).catch(() => undefined);
    }
  },
  async remove(id) {
    await Filesystem.rmdir({ path: `${ROOT}/${id}`, directory: dir, recursive: true }).catch(() => undefined);
  },
});
