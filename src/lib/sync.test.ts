import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Supabase is mocked: uploads/inserts succeed unless a test makes them fail.
const upload = vi.fn();
const insert = vi.fn();
vi.mock('@capacitor/network', () => ({ Network: { addListener: vi.fn() } }));
vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }),
      }),
    },
    from: () => ({ insert }),
  },
}));

const { db, saveOfflineAttendance } = await import('./db');
const { syncPendingRecords, startAutoSync, retryDelayMs, getLastSyncTrigger } = await import('./sync');

const queueOne = () =>
  saveOfflineAttendance(
    'user-1',
    'Test User',
    { id: 'site-1', name: 'Test Site' },
    'CLOCK_IN',
    { lat: 11.83, lng: 13.15 },
    new Blob(['face'], { type: 'image/jpeg' }),
    new Blob(['site'], { type: 'image/jpeg' }),
  );

describe('sync engine', () => {
  beforeEach(async () => {
    await db.attendance.clear();
    upload.mockReset().mockResolvedValue({ error: null });
    insert.mockReset().mockResolvedValue({ error: null });
  });

  it('keeps a failed record pending and saves the attempt count and error', async () => {
    await queueOne();
    upload.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await syncPendingRecords();

    expect(result).toEqual({ synced: 0, errors: 1 });
    const [record] = await db.attendance.toArray();
    expect(record.syncStatus).toBe('PENDING');
    expect(record.attempts).toBe(1);
    expect(record.lastError).toBe('Failed to fetch');
  });

  it('records Supabase error objects (not just Error instances)', async () => {
    await queueOne();
    insert.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } });

    await syncPendingRecords();

    const [record] = await db.attendance.toArray();
    expect(record.lastError).toBe('new row violates row-level security policy');
  });

  it('marks a record SYNCED and clears its error once it uploads', async () => {
    await queueOne();
    upload.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await syncPendingRecords();

    const result = await syncPendingRecords();

    expect(result).toEqual({ synced: 1, errors: 0 });
    const [record] = await db.attendance.toArray();
    expect(record.syncStatus).toBe('SYNCED');
    expect(record.lastError).toBeUndefined();
  });

  it('backs off 30 s, 1 min, 2 min, then every 5 min', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 300_000, 300_000, 300_000]);
  });
});

describe('auto-sync retry', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    await db.attendance.clear();
    upload.mockReset().mockResolvedValue({ error: null });
    insert.mockReset().mockResolvedValue({ error: null });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries a failed upload within about 30 seconds, not 5 minutes', async () => {
    await queueOne();
    upload.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const stop = startAutoSync();
    await vi.advanceTimersByTimeAsync(1_000); // first run fails
    expect((await db.attendance.toArray())[0].syncStatus).toBe('PENDING');

    await vi.advanceTimersByTimeAsync(31_000); // retry succeeds
    expect((await db.attendance.toArray())[0].syncStatus).toBe('SYNCED');
    stop();
  });

  it('uploads waiting records within ~30 s even if no "online" signal ever arrives', async () => {
    const stop = startAutoSync();
    await vi.advanceTimersByTimeAsync(1_000);
    await queueOne(); // queued after start; no online/visibility event follows

    await vi.advanceTimersByTimeAsync(31_000);
    // The check does a few IndexedDB round-trips; let them settle (no further timers fire).
    await vi.waitFor(async () => expect((await db.attendance.toArray())[0].syncStatus).toBe('SYNCED'), { interval: 1 });
    expect(getLastSyncTrigger()?.reason).toBe('pending check');
    stop();
  });

  it('waits a few seconds after the phone reports "online" before uploading', async () => {
    const stop = startAutoSync();
    await vi.advanceTimersByTimeAsync(1_000);
    await queueOne();
    upload.mockClear();

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(upload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    expect(upload).toHaveBeenCalled();
    stop();
  });
});
