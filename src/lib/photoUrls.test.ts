import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrls = vi.fn();
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => ({ createSignedUrls }) } } }));
const { clearPhotoUrls, forgetPhoto, renewPhotoUrl, signListPhotos, signPhotoUrls, thumbPathOf } = await import('./photoUrls');

let n = 0;
beforeEach(() => {
  clearPhotoUrls();
  createSignedUrls.mockReset();
  createSignedUrls.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: path === 'gone.jpg' || path === 'old/face_thumb.jpg' ? null : `https://x/${path}?token=${++n}` })),
  }));
  vi.useRealTimers();
});

describe('signPhotoUrls', () => {
  it('reuses a link until a minute before it expires, then signs again', async () => {
    vi.useFakeTimers({ now: 0 });
    const first = await signPhotoUrls('event-photos', ['a.jpg', 'b.jpg', 'a.jpg', '']);
    expect(createSignedUrls).toHaveBeenCalledWith(['a.jpg', 'b.jpg'], 600);
    vi.setSystemTime(8 * 60_000);
    expect(await signPhotoUrls('event-photos', ['a.jpg', 'c.jpg'])).toEqual({ 'a.jpg': first['a.jpg'], 'c.jpg': expect.any(String) });
    expect(createSignedUrls).toHaveBeenLastCalledWith(['c.jpg'], 600); // a.jpg came from the cache
    vi.setSystemTime(9 * 60_000 + 1);
    const later = await signPhotoUrls('event-photos', ['a.jpg']);
    expect(later['a.jpg']).not.toBe(first['a.jpg']);
  });

  it('keeps buckets apart, leaves out missing files, and renews one link on demand', async () => {
    const event = await signPhotoUrls('event-photos', ['x.jpg', 'gone.jpg']);
    expect(Object.keys(event)).toEqual(['x.jpg']);
    await signPhotoUrls('reference-photos', ['x.jpg']);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    const renewed = await renewPhotoUrl('event-photos', 'x.jpg');
    expect(renewed).not.toBe(event['x.jpg']);
    expect(createSignedUrls).toHaveBeenLastCalledWith(['x.jpg'], 600);
  });
});

describe('signListPhotos', () => {
  it('uses the thumbnail when it exists, else the full photo, and remembers which have none', async () => {
    expect(thumbPathOf('org/ev/site.jpg')).toBe('org/ev/site_thumb.jpg');
    expect(thumbPathOf('org/staff.jpg')).toBe('org/staff_thumb.jpg');
    const list = await signListPhotos('event-photos', ['new/face.jpg', 'old/face.jpg', '']);
    expect(list['new/face.jpg'].path).toBe('new/face_thumb.jpg');
    expect(list['old/face.jpg'].path).toBe('old/face.jpg');
    expect(createSignedUrls.mock.calls.map((c) => c[0])).toEqual([['new/face_thumb.jpg', 'old/face_thumb.jpg'], ['old/face.jpg']]);
    createSignedUrls.mockClear();
    await signListPhotos('event-photos', ['old/face.jpg']);
    expect(createSignedUrls).not.toHaveBeenCalled(); // no second look for a thumbnail that doesn't exist; full link reused
  });
});

describe('forgetPhoto', () => {
  it('drops the links of a replaced photo and its thumbnail', async () => {
    const before = await signListPhotos('reference-photos', ['org/staff.jpg']);
    forgetPhoto('reference-photos', 'org/staff.jpg');
    const after = await signListPhotos('reference-photos', ['org/staff.jpg']);
    expect(after['org/staff.jpg'].url).not.toBe(before['org/staff.jpg'].url);
  });
});
