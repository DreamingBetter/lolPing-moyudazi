import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pruneAssets } from '../../tools/pruneAssets';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('pruneAssets', () => {
  it('keeps the Heartsteel sound used by the overlay when pruning copied assets', () => {
    const root = mkdtempSync(join(tmpdir(), 'lolping-assets-'));
    dirs.push(root);
    const outDir = join(root, 'out');
    for (const dir of ['textures', 'sounds', 'emotes']) mkdirSync(join(outDir, dir), { recursive: true });
    writeFileSync(join(outDir, 'sounds', 'heartsteel.mp3'), 'heartsteel');
    writeFileSync(join(outDir, 'sounds', 'unused.wav'), 'unused');

    const plugin = pruneAssets() as unknown as {
      configResolved: (config: { root: string; build: { outDir: string } }) => void;
      closeBundle: () => void;
    };
    plugin.configResolved({ root, build: { outDir } });
    plugin.closeBundle();

    expect(existsSync(join(outDir, 'sounds', 'heartsteel.mp3'))).toBe(true);
    expect(existsSync(join(outDir, 'sounds', 'unused.wav'))).toBe(false);
  });
});
