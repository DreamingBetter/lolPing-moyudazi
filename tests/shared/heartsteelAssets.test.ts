import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const assets = resolve(__dirname, '../../assets');

describe('heartsteel assets', () => {
  it('ships the Heartsteel item, target reference, and sound under ASCII file names', () => {
    expect(existsSync(resolve(assets, 'heartsteel', 'item.png'))).toBe(true);
    expect(existsSync(resolve(assets, 'heartsteel', 'target-reference.png'))).toBe(true);
    expect(existsSync(resolve(assets, 'sounds', 'heartsteel.mp3'))).toBe(true);
  });
});
