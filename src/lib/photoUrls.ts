import { supabase } from './supabase';

// Short-lived links to private photos, shared by the admin screens.
//
// A signed link's address changes every time it is signed, and the browser
// caches photos by address. So links are reused until shortly before they
// expire: returning to a screen then shows photos from the browser cache
// instead of downloading them again. A photo whose link has expired is signed
// again only when it fails to load (renewPhotoUrl).
export type PhotoBucket = 'event-photos' | 'reference-photos';

const TTL_S = 600; // 10 minutes (P04: keep links short-lived)
const REUSE_MARGIN_MS = 60_000; // don't hand out a link with less than a minute left
const cache = new Map<string, { url: string; expiresAt: number }>();
const keyOf = (bucket: PhotoBucket, path: string) => `${bucket}/${path}`;

// path -> signed URL for each path that exists; one request for the ones not cached.
export const signPhotoUrls = async (bucket: PhotoBucket, paths: string[]): Promise<Record<string, string>> => {
  const now = Date.now();
  const unique = [...new Set(paths.filter(Boolean))];
  const fresh = (path: string) => {
    const hit = cache.get(keyOf(bucket, path));
    return hit && hit.expiresAt - REUSE_MARGIN_MS > now ? hit.url : null;
  };
  const missing = unique.filter((p) => !fresh(p));
  if (missing.length) {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(missing, TTL_S);
    for (const s of data ?? []) {
      if (s.signedUrl && s.path) cache.set(keyOf(bucket, s.path), { url: s.signedUrl, expiresAt: now + TTL_S * 1000 });
    }
  }
  return Object.fromEntries(unique.flatMap((p) => {
    const url = fresh(p);
    return url ? [[p, url]] : [];
  }));
};

// A photo failed to load (usually an expired link): sign it again.
export const renewPhotoUrl = async (bucket: PhotoBucket, path: string) => {
  cache.delete(keyOf(bucket, path));
  return (await signPhotoUrls(bucket, [path]))[path] ?? null;
};

// Thumbnails sit next to the photo: face.jpg -> face_thumb.jpg, {staff}.jpg ->
// {staff}_thumb.jpg (P02). Also used by purge-expired-photos and data-request.
export const thumbPathOf = (path: string) => path.replace(/\.jpg$/, '_thumb.jpg');

export interface ListPhoto {
  url: string;
  path: string; // what the URL points at: the thumbnail, or the photo itself when there's no thumbnail
}
const noThumb = new Set<string>(); // photos uploaded before thumbnails existed (or by an older app)

// Links for showing photos small in a list: the thumbnail when one exists,
// otherwise the full photo. Keyed by the full photo's path.
export const signListPhotos = async (bucket: PhotoBucket, paths: string[]): Promise<Record<string, ListPhoto>> => {
  const unique = [...new Set(paths.filter(Boolean))];
  const wanted = unique.filter((p) => !noThumb.has(keyOf(bucket, p)));
  const thumbs = await signPhotoUrls(bucket, wanted.map(thumbPathOf));
  for (const p of wanted) if (!thumbs[thumbPathOf(p)]) noThumb.add(keyOf(bucket, p));
  const fallback = unique.filter((p) => !thumbs[thumbPathOf(p)]);
  const full = fallback.length ? await signPhotoUrls(bucket, fallback) : {};
  return Object.fromEntries(unique.flatMap((p) => {
    const thumb = thumbs[thumbPathOf(p)];
    if (thumb) return [[p, { url: thumb, path: thumbPathOf(p) }]];
    return full[p] ? [[p, { url: full[p], path: p }]] : [];
  }));
};

// After a photo is replaced (reference photos): drop its links so the new one shows.
export const forgetPhoto = (bucket: PhotoBucket, path: string) => {
  for (const p of [path, thumbPathOf(path)]) cache.delete(keyOf(bucket, p));
  noThumb.delete(keyOf(bucket, path));
};

// On sign-out, so the next person on this device can't reuse the links.
export const clearPhotoUrls = () => {
  cache.clear();
  noThumb.clear();
};
