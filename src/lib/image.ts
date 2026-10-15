// Decode a base64 data URL (e.g. a webcam screenshot) into a Blob without
// fetch(), which the Content-Security-Policy blocks for data: URLs.
export const dataUrlToBlob = (dataUrl: string) => {
  const [header, data] = dataUrl.split(',', 2);
  const type = /^data:([^;,]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
};

// Fit width x height inside a maxSide x maxSide box, never upscaling.
export const fitWithin = (width: number, height: number, maxSide: number) => {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

// Re-encode a photo as a JPEG whose longest side is at most maxSide. Throws if
// the device can't decode or encode it.
const encodeJpeg = async (blob: Blob, maxSide: number, quality: number): Promise<Blob> => {
  const bitmap = await createImageBitmap(blob); // applies EXIF orientation
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!encoded) throw new Error('JPEG encoding failed');
  return encoded;
};

// Shrink a photo on the device before it is queued. The web camera ignores
// Capacitor's `width` option and returns full-size (~4 MB) photos, which are slow
// to upload on 2G/3G and fill device storage. Falls back to the original on error.
export const shrinkPhoto = async (blob: Blob, maxSide = 1280, quality = 0.7): Promise<Blob> => {
  try {
    const shrunk = await encodeJpeg(blob, maxSide, quality);
    return shrunk.size < blob.size ? shrunk : blob;
  } catch (err) {
    console.error('Photo shrink failed; keeping original', err);
    return blob;
  }
};

// Small copy for admin lists (P02): 320 px on the longest side, about 8-17 KB
// instead of 40-170 KB. Lists show it; the full photo loads only when opened.
// Null when the device can't make one (the lists then use the full photo).
const THUMB_SIDE = 320;
export const makeThumbnail = async (blob: Blob): Promise<Blob | null> => {
  try {
    return await encodeJpeg(blob, THUMB_SIDE, 0.7);
  } catch {
    return null;
  }
};
