import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Capacitor's Android file server returns index.html for any path whose last
// segment has no '.', so extensionless model shards break the native app.
const MODELS_DIR = join(process.cwd(), 'public/models');

describe('face-api model files', () => {
  it('all have a file extension', () => {
    const missing = readdirSync(MODELS_DIR).filter((name) => !name.includes('.'));
    expect(missing).toEqual([]);
  });

  it('every shard listed in a weights manifest exists', () => {
    const manifests = readdirSync(MODELS_DIR).filter((name) => name.endsWith('-weights_manifest.json'));
    expect(manifests.length).toBe(3);
    for (const manifest of manifests) {
      const groups = JSON.parse(readFileSync(join(MODELS_DIR, manifest), 'utf8')) as { paths: string[] }[];
      for (const path of groups.flatMap((g) => g.paths)) {
        expect(existsSync(join(MODELS_DIR, path)), `${manifest} -> ${path}`).toBe(true);
      }
    }
  });
});
