import { describe, expect, it } from 'vitest';
import { dataUrlToBlob, fitWithin } from './image';

describe('fitWithin', () => {
  it('scales a large landscape photo so its long side is 1280', () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
  });

  it('scales a large portrait photo so its long side is 1280', () => {
    expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it('never upscales a small photo', () => {
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });
});

describe('dataUrlToBlob', () => {
  it('decodes a base64 JPEG data URL with its type', async () => {
    const blob = dataUrlToBlob(`data:image/jpeg;base64,${btoa('jpeg-bytes')}`);
    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('jpeg-bytes');
  });
});
