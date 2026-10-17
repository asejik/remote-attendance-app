import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout, REQUEST_TIMEOUT_MS, timeoutFor, UPLOAD_TIMEOUT_MS } from './fetchTimeout';

// A fetch that never answers until aborted.
const hanging = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
}));

afterEach(() => {
  vi.useRealTimers();
  hanging.mockClear();
});

describe('fetchWithTimeout', () => {
  it('gives uploads longer than other requests', () => {
    const base = 'https://x.supabase.co';
    expect(timeoutFor(`${base}/storage/v1/object/event-photos/o/e/face.jpg`, 'POST')).toBe(UPLOAD_TIMEOUT_MS);
    expect(timeoutFor(`${base}/storage/v1/object/sign/event-photos`, 'POST')).toBe(REQUEST_TIMEOUT_MS);
    expect(timeoutFor(`${base}/storage/v1/object/event-photos/o/e/face.jpg`, 'GET')).toBe(REQUEST_TIMEOUT_MS);
    expect(timeoutFor(`${base}/rest/v1/staff`, 'GET')).toBe(REQUEST_TIMEOUT_MS);
    expect(timeoutFor(`${base}/auth/v1/token?grant_type=password`, 'POST')).toBe(REQUEST_TIMEOUT_MS);
  });

  it('fails a request that gets no answer within the limit', async () => {
    vi.useFakeTimers();
    const pending = fetchWithTimeout(hanging)('https://x.supabase.co/rest/v1/staff');
    const outcome = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await outcome;
  });

  it("passes answers through and keeps the caller's own abort working", async () => {
    const ok = vi.fn(async () => new Response('fine'));
    expect(await (await fetchWithTimeout(ok)('https://x/rest/v1/a')).text()).toBe('fine');
    const caller = new AbortController();
    const pending = fetchWithTimeout(hanging)('https://x/rest/v1/a', { signal: caller.signal });
    caller.abort(new Error('cancelled by caller'));
    await expect(pending).rejects.toThrow('cancelled by caller');
  });
});
