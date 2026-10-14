import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueuedEvent } from './queue';

// Supabase is mocked: uploads and inserts succeed unless a test makes them fail.
const upload = vi.fn();
const upsert = vi.fn();
const flags = vi.fn();
const session = vi.fn();
const report = vi.fn();
vi.mock('@capacitor/network', () => ({ Network: { addListener: vi.fn() } }));
vi.mock('./monitoring', () => ({ reportSyncProblem: (...args: unknown[]) => report(...args) }));
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: () => session() },
    storage: { from: () => ({ upload }) },
    from: () => ({ upsert, select: () => ({ eq: () => ({ maybeSingle: () => flags() }) }) }),
  },
}));

const { queue, setQueueStore } = await import('./queue');
const { createWebStore } = await import('./queue/webStore');
const { syncPendingRecords, startAutoSync, retryDelayMs, getLastSyncTrigger, refusalReason } = await import('./sync');

setQueueStore(createWebStore());

let n = 0;
const queueOne = async (overrides: Partial<QueuedEvent> = {}) => {
  const event: QueuedEvent = {
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, userId: 'user-1', organizationId: 'org-1',
    staffId: 'staff-1', siteId: 'site-1', siteName: 'Site', type: 'CLOCK_IN', capturedAt: new Date(Date.UTC(2026, 9, 14, 8, n)).toISOString(),
    latitude: 11.83, longitude: 13.15, accuracyM: 12, livenessPassed: true, hasFacePhoto: true, hasSitePhoto: true,
    status: 'pending', attempts: 0, ...overrides,
  };
  await queue.add(event, {
    face: new Blob(['face'], { type: 'image/jpeg' }),
    site: event.hasSitePhoto ? new Blob(['site'], { type: 'image/jpeg' }) : null,
  });
  return event;
};
const stored = async (id: string) => (await queue.forUser('user-1')).concat(await queue.forUser('user-2')).find((e) => e.id === id)!;

const resetMocks = async () => {
  for (const e of [...(await queue.forUser('user-1')), ...(await queue.forUser('user-2'))]) await queue.update(e.id, { status: 'synced' });
  upload.mockReset().mockResolvedValue({ error: null });
  upsert.mockReset().mockResolvedValue({ error: null });
  flags.mockReset().mockResolvedValue({ data: { flags: ['outside_radius'] } });
  session.mockReset().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  report.mockReset();
};

describe('sync engine', () => {
  beforeEach(resetMocks);

  it('uploads photos to private org/event paths, inserts the event and stores the server flags', async () => {
    const event = await queueOne();
    expect(await syncPendingRecords()).toEqual({ synced: 1, errors: 0 });

    expect(upload.mock.calls.map((c) => c[0])).toEqual([`org-1/${event.id}/face.jpg`, `org-1/${event.id}/site.jpg`]);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/jpeg', upsert: false });
    const [row, options] = upsert.mock.calls[0];
    expect(row).toMatchObject({
      id: event.id, organization_id: 'org-1', staff_id: 'staff-1', site_id: 'site-1', type: 'CLOCK_IN',
      accuracy_m: 12, liveness_passed: true, face_photo_path: `org-1/${event.id}/face.jpg`, site_photo_path: `org-1/${event.id}/site.jpg`,
    });
    expect(options).toEqual({ onConflict: 'id', ignoreDuplicates: true });

    const after = await stored(event.id);
    expect(after.status).toBe('synced');
    expect(after.flags).toEqual(['outside_radius']);
    expect(await queue.getPhoto(event.id, 'face')).toBeNull(); // photos removed from the device
  });

  it('skips the site photo when none was taken', async () => {
    const event = await queueOne({ hasSitePhoto: false });
    await syncPendingRecords();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].site_photo_path).toBeNull();
    expect((await stored(event.id)).status).toBe('synced');
  });

  it('treats "already exists" from a previous partial upload as success', async () => {
    const event = await queueOne();
    upload.mockResolvedValueOnce({ error: { statusCode: '409', message: 'The resource already exists' } });
    expect(await syncPendingRecords()).toEqual({ synced: 1, errors: 0 });
    expect((await stored(event.id)).status).toBe('synced');
  });

  it('keeps a failed record pending with its attempt count and error, photos intact', async () => {
    const event = await queueOne();
    upload.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await syncPendingRecords()).toEqual({ synced: 0, errors: 1 });
    const after = await stored(event.id);
    expect(after).toMatchObject({ status: 'pending', attempts: 1, lastError: 'Failed to fetch' });
    expect(await queue.getPhoto(event.id, 'face')).not.toBeNull();
  });

  it('records Supabase error objects (not just Error instances)', async () => {
    const event = await queueOne();
    upsert.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } });
    await syncPendingRecords();
    expect((await stored(event.id)).lastError).toBe('new row violates row-level security policy');
  });

  it('marks a record failed after the server refuses it twice, keeps its photos and reports it once', async () => {
    const event = await queueOne();
    const rls = { code: '42501', message: 'new row violates row-level security policy for table "attendance_events"' };
    upsert.mockResolvedValue({ error: rls });

    await syncPendingRecords();
    expect((await stored(event.id)).status).toBe('pending'); // one refusal could be a fluke
    expect(report).not.toHaveBeenCalled();

    await syncPendingRecords();
    const after = await stored(event.id);
    expect(after).toMatchObject({ status: 'failed', attempts: 2, failReason: expect.stringMatching(/not allowed/) });
    expect(await queue.getPhoto(event.id, 'face')).not.toBeNull();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0].slice(0, 3)).toEqual(['refused', '42501', undefined]);

    await syncPendingRecords(); // failed records are no longer retried
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(await queue.allPending()).toEqual([]);
  });

  it('puts a failed record back in the queue on "try again", and never prunes it', async () => {
    const event = await queueOne();
    await queue.update(event.id, { status: 'failed', attempts: 2, failReason: 'x' });
    await queue.prune(Date.now() + 90 * 86_400_000);
    expect((await stored(event.id)).status).toBe('failed');
    await queue.retry(event.id);
    const back = await stored(event.id);
    expect(back).toMatchObject({ status: 'pending', attempts: 0 });
    expect(back.failReason).toBeUndefined();
    expect(await syncPendingRecords()).toEqual({ synced: 1, errors: 0 });
  });

  it('reports a record that keeps failing for other reasons once, at the third try; network errors never', async () => {
    const serverDown = await queueOne();
    upsert.mockResolvedValue({ error: { code: 'PGRST000', message: 'Could not connect to the database' } });
    for (let i = 0; i < 4; i++) await syncPendingRecords();
    expect((await stored(serverDown.id)).status).toBe('pending');
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBe('failing');

    await queue.update(serverDown.id, { status: 'synced' });
    report.mockReset();
    await queueOne();
    upload.mockRejectedValue(new TypeError('Failed to fetch'));
    for (let i = 0; i < 4; i++) await syncPendingRecords();
    expect(report).not.toHaveBeenCalled();
  });

  it('tells refusals apart from session and server problems', () => {
    expect(refusalReason({ code: '42501', message: 'rls' })).toMatch(/not allowed/);
    expect(refusalReason({ statusCode: '403', status: 400, message: 'new row violates row-level security policy' })).toMatch(/not allowed/);
    expect(refusalReason({ code: '23503', message: 'foreign key' })).toMatch(/did not accept/);
    expect(refusalReason({ statusCode: '413', message: 'Payload too large' })).toMatch(/too large/);
    expect(refusalReason({ statusCode: '403', status: 400, message: 'jwt expired' })).toBeNull();
    expect(refusalReason({ code: 'PGRST301', message: 'JWT expired' })).toBeNull();
    expect(refusalReason({ status: 503, message: 'Service unavailable' })).toBeNull();
    expect(refusalReason(new TypeError('Failed to fetch'))).toBeNull();
  });

  it("only uploads the signed-in user's records", async () => {
    const mine = await queueOne();
    const theirs = await queueOne({ userId: 'user-2' });
    await syncPendingRecords();
    expect((await stored(mine.id)).status).toBe('synced');
    expect((await stored(theirs.id)).status).toBe('pending');
  });

  it('does nothing without a session', async () => {
    const event = await queueOne();
    session.mockResolvedValue({ data: { session: null } });
    expect(await syncPendingRecords()).toEqual({ synced: 0, errors: 0 });
    expect((await stored(event.id)).status).toBe('pending');
  });

  it('backs off 30 s, 1 min, 2 min, then every 5 min', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 300_000, 300_000, 300_000]);
  });
});

describe('auto-sync', () => {
  beforeEach(async () => {
    await resetMocks();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const settled = (id: string) => vi.waitFor(async () => expect((await stored(id)).status).toBe('synced'), { interval: 1 });

  it('retries a failed upload within about 30 seconds', async () => {
    const event = await queueOne();
    upload.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const stop = startAutoSync();
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await stored(event.id)).status).toBe('pending');
    await vi.advanceTimersByTimeAsync(31_000);
    await settled(event.id);
    stop();
  });

  it('uploads within ~30 s even if no "online" signal ever arrives', async () => {
    const stop = startAutoSync();
    await vi.advanceTimersByTimeAsync(1_000);
    const event = await queueOne();
    await vi.advanceTimersByTimeAsync(31_000);
    await settled(event.id);
    expect(getLastSyncTrigger()?.reason).toBe('pending check');
    stop();
  });

  it('waits a few seconds after "online" before uploading', async () => {
    const stop = startAutoSync();
    await vi.advanceTimersByTimeAsync(1_000);
    await queueOne();
    upload.mockClear();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(upload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.waitFor(() => expect(upload).toHaveBeenCalled(), { interval: 1 });
    stop();
  });
});
