import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/main/settingsStore';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings';

const tempDir = () => mkdtempSync(join(tmpdir(), 'lolping-'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForVolume(file: string, expected: number): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const volume = JSON.parse(readFileSync(file, 'utf8')).volume;
      if (volume === expected) return;
    }
    await sleep(20);
  }
  expect(JSON.parse(readFileSync(file, 'utf8')).volume).toBe(expected);
}

describe('SettingsStore', () => {
  it('uses defaults when there is no file', () => {
    const store = new SettingsStore(tempDir());
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(store.problems).toEqual([]);
  });

  it('backs up a corrupt file and falls back to defaults', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), '{ not json');
    const store = new SettingsStore(dir);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(readFileSync(join(dir, 'settings.bak.json'), 'utf8')).toBe('{ not json');
    expect(store.problems).toHaveLength(1);
  });

  it('saves the defaults it filled in, so the tag colour stays the same on the next launch', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, volume: 30 })); // a 0.2.1 file: no room keys
    const firstStore = new SettingsStore(dir, 10, 'win', { name: 'darren', color: 3 });
    const first = firstStore.load();
    await firstStore.flush();
    const second = new SettingsStore(dir, 10, 'win', { name: 'darren', color: 6 }).load();
    expect([first.tagColor, second.tagColor]).toEqual([3, 3]);
    expect(second.volume).toBe(30);
  });

  it('saves on the very first run too', async () => {
    const dir = tempDir();
    const store = new SettingsStore(dir, 10, 'win', { name: 'darren', color: 2 });
    store.load();
    await store.flush();
    expect(new SettingsStore(dir, 10, 'win', { name: 'darren', color: 7 }).load().tagColor).toBe(2);
  });

    it('normalizes values read from disk', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ volume: 900, trigger: 'ctrl' }));
    const s = new SettingsStore(dir).load();
    expect(s.volume).toBe(100);
    expect(s.trigger).toBe('ctrl');
  });

  it('flags an emote key clash from a hand-edited file', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ trigger: 'ctrl', emoteTrigger: 'ctrl' }));
    const store = new SettingsStore(dir);
    expect(store.load().emoteTrigger).toBe('off');
    expect(store.emoteKeyClashed).toBe(true);
  });

  it('does not flag an upgrading Ctrl user, whose emote key just ends up off', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ trigger: 'ctrl' })); // a 0.4.0 file: no emote keys
    const store = new SettingsStore(dir);
    expect(store.load().emoteTrigger).toBe('off');
    expect(store.emoteKeyClashed).toBe(false);
  });

  it('does not flag an emote key that was already off, or one without a clash', () => {
    for (const file of [{ trigger: 'ctrl', emoteTrigger: 'off' }, { trigger: 'alt', emoteTrigger: 'ctrl' }, {}]) {
      const dir = tempDir();
      writeFileSync(join(dir, 'settings.json'), JSON.stringify(file));
      const store = new SettingsStore(dir);
      store.load();
      expect(store.emoteKeyClashed).toBe(false);
    }
  });

  it('flags a clash with the pause key too', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ emoteTrigger: { vk: 0x50 } }));
    const store = new SettingsStore(dir);
    store.load();
    expect(store.emoteKeyClashed).toBe(true);
  });

  it('flags an action key clash from a hand-edited file', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ trigger: 'shift', emoteTrigger: 'ctrl', actionTrigger: 'shift' }));
    const store = new SettingsStore(dir);
    expect(store.load().actionTrigger).toBe('off');
    expect(store.actionKeyClashed).toBe(true);
  });

  it('does not flag the default action key filled in for an older file', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ trigger: 'win', emoteTrigger: 'ctrl' }));
    const store = new SettingsStore(dir);
    expect(store.load().actionTrigger).toBe('shift');
    expect(store.actionKeyClashed).toBe(false);
  });

  it('resets action key clash tracking on each load', () => {
    const dir = tempDir();
    const file = join(dir, 'settings.json');
    writeFileSync(file, JSON.stringify({ trigger: 'shift', emoteTrigger: 'ctrl', actionTrigger: 'shift' }));
    const store = new SettingsStore(dir);
    store.load();
    expect(store.actionKeyClashed).toBe(true);

    writeFileSync(file, JSON.stringify({ trigger: 'alt', emoteTrigger: 'ctrl', actionTrigger: 'win' }));
    store.load();
    expect(store.actionKeyClashed).toBe(false);
  });

  it('saves the emote fields it filled in for an older file', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, volume: 30 }));
    const store = new SettingsStore(dir, 10);
    store.load();
    await store.flush();
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))).toMatchObject({ emoteTrigger: 'ctrl', emoteSizePx: 150, customEmotes: [] });
  });

  it('emits change with the normalized value', () => {
    const store = new SettingsStore(tempDir());
    store.load();
    let seen: Settings | null = null;
    store.on('change', (s: Settings) => {
      seen = s;
    });
    const result = store.update({ pingSizePx: 10 });
    expect(result.pingSizePx).toBe(60);
    expect(seen).toEqual(result);
    expect(store.get()).toEqual(result);
  });

  it('flushes atomically and round-trips', async () => {
    const dir = tempDir();
    const store = new SettingsStore(dir);
    store.load();
    store.update({ volume: 33, clickPing: true });
    await store.flush();
    expect(existsSync(join(dir, 'settings.json.tmp'))).toBe(false);
    const again = new SettingsStore(dir).load();
    expect(again.volume).toBe(33);
    expect(again.clickPing).toBe(true);
  });

  it('debounces writes and keeps the last value', async () => {
    const dir = tempDir();
    const store = new SettingsStore(dir, 60);
    store.load();
    store.update({ volume: 10 });
    store.update({ volume: 20 });
    // Well inside the debounce window: an immediate (or ignored-debounce) write would have landed by now.
    await sleep(25);
    expect(existsSync(join(dir, 'settings.json'))).toBe(false);
    await waitForVolume(join(dir, 'settings.json'), 20);
  });

  it('still falls back to defaults when the corrupt file cannot be backed up', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'settings.json'), '{ not json');
    mkdirSync(join(dir, 'settings.bak.json')); // a directory in the way makes copyFileSync fail
    const store = new SettingsStore(dir);
    let loaded: Settings | undefined;
    expect(() => {
      loaded = store.load();
    }).not.toThrow();
    expect(loaded).toEqual(DEFAULT_SETTINGS);
    expect(store.problems).toHaveLength(1);
    expect(store.problems[0]).toContain('could not be backed up');
  });

  it('records a failed save in problems and leaves no .tmp behind', async () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'settings.json')); // rename onto a directory always fails
    const store = new SettingsStore(dir);
    store.update({ volume: 5 });
    await expect(store.flush()).resolves.toBeUndefined();
    expect(store.problems.some((p) => p.startsWith('Could not save settings'))).toBe(true);
    expect(existsSync(join(dir, 'settings.json.tmp'))).toBe(false);
  });

  it.skipIf(process.platform !== 'win32')('retries a transient rename failure (EPERM on Windows)', async () => {
    const dir = tempDir();
    const target = join(dir, 'settings.json');
    mkdirSync(target); // Windows reports EPERM for rename-onto-directory, a retryable code
    setTimeout(() => rmSync(target, { recursive: true }), 20); // the "antivirus lock" clears before the retry
    const store = new SettingsStore(dir);
    store.update({ volume: 44 });
    await store.flush();
    expect(store.problems).toEqual([]);
    expect(JSON.parse(readFileSync(target, 'utf8')).volume).toBe(44);
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });
});
