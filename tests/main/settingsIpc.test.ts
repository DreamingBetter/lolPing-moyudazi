import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmoteLibrary } from '../../src/main/emoteLibrary';
import { registerSettingsIpc, type SettingsIpcDeps } from '../../src/main/settingsIpc';
import { SettingsStore } from '../../src/main/settingsStore';
import { strings } from '../../src/shared/i18n';
import { SETTINGS_CH } from '../../src/shared/ipc';
import type { RoomChatState } from '../../src/shared/roomChat';
import type { UpdateState } from '../../src/shared/update';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  opened: [] as string[],
}));

vi.mock('electron', () => ({
  app: { getFileIcon: vi.fn(async () => ({ isEmpty: () => false, toDataURL: () => 'data:image/png;base64,YXBw' })) },
  ipcMain: { handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => h.handlers.set(channel, fn) },
  globalShortcut: { register: () => true, unregister: () => undefined },
  shell: { openExternal: async (url: string) => void h.opened.push(url) },
  dialog: {
    showOpenDialog: vi.fn(async (_opts: unknown) => ({ canceled: false, filePaths: ['C:\\Picked\\thing.exe'] })),
  },
  net: { fetch: vi.fn(async () => new Response('', { status: 404 })) },
  protocol: {},
}));

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
/** A 160 × 160 lossy WebP header padded out; `fill` makes each one a different image. */
const still = (fill: number): Uint8Array => {
  const out = new Uint8Array(400).fill(fill);
  out.set([...ascii('RIFFxxxxWEBPVP8 '), 0, 0, 0, 0, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 160, 0, 160, 0]);
  return out;
};
const idOf = (b: Uint8Array): string => `c:${createHash('sha256').update(b).digest('hex').slice(0, 32)}`;

let store: SettingsStore;
let library: EmoteLibrary;
let roomApi: SettingsIpcDeps['room'];
let shown: string[];
const call = (channel: string, ...args: unknown[]): Promise<unknown> => Promise.resolve(h.handlers.get(channel)!({}, ...args));

beforeEach(() => {
  h.handlers.clear();
  h.opened.length = 0;
  const dir = mkdtempSync(join(tmpdir(), 'lolping-ipc-'));
  store = new SettingsStore(dir, 60_000);
  store.load();
  library = new EmoteLibrary(join(dir, 'emotes'));
  const chatState: RoomChatState = { phase: 'active', code: 'PING-12345-6789A', members: 2, messages: [] };
  roomApi = {
    state: vi.fn(),
    create: vi.fn(async () => undefined),
    join: vi.fn(async () => ({ ok: true as const })),
    leave: vi.fn(),
    mute: vi.fn(),
    clipboardCode: vi.fn(async () => null),
    copyCode: vi.fn(),
    retryInternet: vi.fn(),
    chatState: vi.fn(() => chatState),
    sendChat: vi.fn((text: string) => ({ ok: true as const, id: text })),
    retryChat: vi.fn((id: string) => ({ ok: true as const, id })),
  };
  shown = [];
  registerWith();
});

/** Registers the handlers again, with optional feature services. */
function registerWith(update?: SettingsIpcDeps['update'], cursorSkin?: unknown): void {
  h.handlers.clear();
  registerSettingsIpc({
    store, library, text: () => strings('en'), platform: 'win', room: roomApi,
    showSection: (section: string) => shown.push(section), update, cursorSkin,
  } as unknown as SettingsIpcDeps);
}

describe('settings IPC', () => {
  it('setSettings ignores customEmotes from the window', async () => {
    const forged = [{ id: `c:${'ab'.repeat(16)}`, name: 'forged', animated: true }];
    const result = await call(SETTINGS_CH.set, { volume: 12, customEmotes: forged });
    expect(result).toMatchObject({ ok: true, settings: { volume: 12, customEmotes: [] } });
    expect(store.get().customEmotes).toEqual([]);
  });

  it('setSettings treats a patch that is not an object as no change', async () => {
    expect(await call(SETTINGS_CH.set, null)).toMatchObject({ ok: true, settings: { volume: store.get().volume } });
  });

  it('setSettings explains wheel key clashes with the shared trigger rule', async () => {
    const result = await call(SETTINGS_CH.set, { actionTrigger: 'alt' });
    expect(result).toMatchObject({
      ok: false,
      error: 'The ping trigger, emote key and action key must be different, and custom wheel keys cannot be the pause shortcut key.',
      settings: { actionTrigger: 'shift' },
    });
    expect(store.get().actionTrigger).toBe('shift');
  });

  it('applies the cursor skin before saving the enabled switch', async () => {
    const cursorSkin = {
      applySummoner: vi.fn(async () => ({ ok: true as const })),
      restoreOriginal: vi.fn(async () => ({ ok: true as const })),
    };
    registerWith(undefined, cursorSkin);

    const result = await call(SETTINGS_CH.set, { cursorSkinEnabled: true });

    expect(result).toMatchObject({ ok: true, settings: { cursorSkinEnabled: true } });
    expect(cursorSkin.applySummoner).toHaveBeenCalledWith('modern');
    expect(cursorSkin.restoreOriginal).not.toHaveBeenCalled();
    expect(store.get().cursorSkinEnabled).toBe(true);
  });

  it('applies the classic cursor skin when enabling with the classic option saved', async () => {
    store.update({ cursorSkinClassic: true });
    const cursorSkin = {
      applySummoner: vi.fn(async () => ({ ok: true as const })),
      restoreOriginal: vi.fn(async () => ({ ok: true as const })),
    };
    registerWith(undefined, cursorSkin);

    const result = await call(SETTINGS_CH.set, { cursorSkinEnabled: true });

    expect(result).toMatchObject({ ok: true, settings: { cursorSkinEnabled: true, cursorSkinClassic: true } });
    expect(cursorSkin.applySummoner).toHaveBeenCalledWith('classic');
    expect(cursorSkin.restoreOriginal).not.toHaveBeenCalled();
  });

  it('reapplies the cursor skin when switching between modern and classic while enabled', async () => {
    store.update({ cursorSkinEnabled: true });
    const cursorSkin = {
      applySummoner: vi.fn(async () => ({ ok: true as const })),
      restoreOriginal: vi.fn(async () => ({ ok: true as const })),
    };
    registerWith(undefined, cursorSkin);

    const result = await call(SETTINGS_CH.set, { cursorSkinClassic: true });

    expect(result).toMatchObject({ ok: true, settings: { cursorSkinEnabled: true, cursorSkinClassic: true } });
    expect(cursorSkin.applySummoner).toHaveBeenCalledWith('classic');
    expect(cursorSkin.restoreOriginal).not.toHaveBeenCalled();
  });

  it('restores the cursor skin before saving the disabled switch', async () => {
    store.update({ cursorSkinEnabled: true });
    const cursorSkin = {
      applySummoner: vi.fn(async () => ({ ok: true as const })),
      restoreOriginal: vi.fn(async () => ({ ok: true as const })),
    };
    registerWith(undefined, cursorSkin);

    const result = await call(SETTINGS_CH.set, { cursorSkinEnabled: false });

    expect(result).toMatchObject({ ok: true, settings: { cursorSkinEnabled: false } });
    expect(cursorSkin.restoreOriginal).toHaveBeenCalledTimes(1);
    expect(cursorSkin.applySummoner).not.toHaveBeenCalled();
    expect(store.get().cursorSkinEnabled).toBe(false);
  });

  it('does not save the cursor switch when the system cursor change fails', async () => {
    const cursorSkin = {
      applySummoner: vi.fn(async () => ({ ok: false as const, error: 'PowerShell failed' })),
      restoreOriginal: vi.fn(async () => ({ ok: true as const })),
    };
    registerWith(undefined, cursorSkin);

    const result = await call(SETTINGS_CH.set, { cursorSkinEnabled: true });

    expect(result).toMatchObject({ ok: false, error: 'PowerShell failed', settings: { cursorSkinEnabled: false } });
    expect(store.get().cursorSkinEnabled).toBe(false);
  });

  it('imports an emote: the files are saved and the entry is added', async () => {
    const s = still(1);
    expect(await call(SETTINGS_CH.emoteImport, { name: 'cat', still: s })).toEqual({ ok: true, id: idOf(s) });
    expect(store.get().customEmotes).toEqual([{ id: idOf(s), name: 'cat', animated: false }]);
    expect(existsSync(join(library.dir, `${idOf(s).slice(2)}.webp`))).toBe(true);
    expect(await call(SETTINGS_CH.emoteImport, { name: 'again', still: s })).toEqual({ ok: false, error: 'duplicate' });
    expect(store.get().customEmotes).toHaveLength(1);
  });

  it('refuses a payload that is not a name and bytes', async () => {
    for (const raw of [null, 'x', { name: 'x' }, { name: 1, still: still(1) }, { name: 'x', still: [1, 2, 3] }, { name: 'x', still: still(1), anim: {} }]) {
      expect(await call(SETTINGS_CH.emoteImport, raw)).toEqual({ ok: false, error: 'type' });
    }
    expect(store.get().customEmotes).toEqual([]);
    expect(existsSync(library.dir) ? readdirSync(library.dir) : []).toEqual([]);
  });

  it('imports several at once one after another, so the 25th is refused', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => call(SETTINGS_CH.emoteImport, { name: `e${i}`, still: still(i + 1) })));
    expect(results.filter((r) => (r as { ok: boolean }).ok)).toHaveLength(24);
    expect(results[24]).toEqual({ ok: false, error: 'full' });
    expect(store.get().customEmotes).toHaveLength(24);
    expect(readdirSync(library.dir)).toHaveLength(24);
  });

  it('removes an emote: its files and entry go, and the wheel slot falls back', async () => {
    const s = still(2);
    await call(SETTINGS_CH.emoteImport, { name: 'dog', still: s });
    const wheel = [idOf(s), ...store.get().emoteWheel.slice(1)];
    store.update({ emoteWheel: wheel, clickEmoteId: idOf(s) });
    expect(store.get().emoteWheel[0]).toBe(idOf(s));
    await call(SETTINGS_CH.emoteRemove, idOf(s));
    expect(store.get().customEmotes).toEqual([]);
    expect(store.get().emoteWheel[0]).not.toBe(idOf(s));
    expect(store.get().clickEmoteId).not.toBe(idOf(s));
    expect(readdirSync(library.dir)).toEqual([]);
  });

  it('ignores a removal that is not an imported emote id', async () => {
    const s = still(3);
    await call(SETTINGS_CH.emoteImport, { name: 'x', still: s });
    for (const raw of [null, 'facepalm', '../settings', { id: idOf(s) }]) await call(SETTINGS_CH.emoteRemove, raw);
    expect(store.get().customEmotes).toHaveLength(1);
  });

  it('opens file and folder pickers', async () => {
    expect(await call(SETTINGS_CH.pickFile)).toBe('C:\\Picked\\thing.exe');
    expect(await call(SETTINGS_CH.pickFolder)).toBe('C:\\Picked\\thing.exe');
  });

  it('returns null when a picker is cancelled', async () => {
    const electron = await import('electron');
    vi.mocked(electron.dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await call(SETTINGS_CH.pickFile)).toBeNull();
  });

  it('exposes room chat state and validates chat send and retry input', async () => {
    expect(await call(SETTINGS_CH.roomChatGet)).toEqual({ phase: 'active', code: 'PING-12345-6789A', members: 2, messages: [] });
    expect(await call(SETTINGS_CH.roomChatSend, 'hello')).toEqual({ ok: true, id: 'hello' });
    expect(roomApi.sendChat).toHaveBeenCalledWith('hello');
    expect(await call(SETTINGS_CH.roomChatSend, 123)).toEqual({ ok: false, error: 'empty' });
    expect(await call(SETTINGS_CH.roomChatRetry, '0123456789abcdef0123456789abcdef')).toEqual({ ok: true, id: '0123456789abcdef0123456789abcdef' });
    expect(roomApi.retryChat).toHaveBeenCalledWith('0123456789abcdef0123456789abcdef');
    expect(await call(SETTINGS_CH.roomChatRetry, null)).toEqual({ ok: false, error: 'failed' });
  });

  it('opens Chat after successful room create and join only', async () => {
    await call(SETTINGS_CH.roomCreate);
    expect(shown).toEqual(['chat']);
    await call(SETTINGS_CH.roomJoin, 'code');
    expect(shown).toEqual(['chat', 'chat']);
    vi.mocked(roomApi.join).mockResolvedValueOnce({ ok: false, error: 'failed' });
    await call(SETTINGS_CH.roomJoin, 'bad');
    expect(shown).toEqual(['chat', 'chat']);
  });

  it('returns a local app icon as a data URL', async () => {
    const electron = await import('electron');
    const iconUrl = 'data:image/png;base64,YXBwLWljb24=';
    vi.mocked(electron.app.getFileIcon).mockResolvedValueOnce({
      isEmpty: () => false,
      toDataURL: () => iconUrl,
    } as never);

    expect(await call(SETTINGS_CH.actionFileIcon, 'C:\\Tools\\tool.exe')).toBe(iconUrl);
  });

  it('returns a website favicon as a data URL', async () => {
    const electron = await import('electron');
    const body = Uint8Array.from([1, 2, 3]);
    vi.mocked(electron.net.fetch).mockResolvedValueOnce(new Response(body, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }) as never);

    expect(await call(SETTINGS_CH.actionUrlIcon, 'https://example.com/docs')).toBe('data:image/png;base64,AQID');
  });

  it('follows homepage icon links when the root favicon is missing', async () => {
    const electron = await import('electron');
    vi.mocked(electron.net.fetch)
      .mockResolvedValueOnce(new Response('', { status: 404 }) as never)
      .mockResolvedValueOnce(new Response('<link rel="apple-touch-icon" href="/touch.png">', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }) as never)
      .mockResolvedValueOnce(new Response(Uint8Array.from([9, 8, 7]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }) as never);

    expect(await call(SETTINGS_CH.actionUrlIcon, 'https://example.com/docs')).toBe('data:image/png;base64,CQgH');
  });
});

describe('update IPC', () => {
  const AVAILABLE: UpdateState = { phase: 'available', version: '0.5.1', notesUrl: 'https://github.com/DreamingBetter/lolPing-moyudazi-Windows/releases/tag/v0.5.1' };

  const NOTES = 'https://github.com/DreamingBetter/lolPing-moyudazi-Windows/releases/tag/v0.5.1';

  /** `notesUrl`: the release notes of the update the checker knows about, if it knows one. */
  function fakeUpdate(state: UpdateState, notesUrl: string | null = null) {
    return { state: vi.fn(() => state), notesUrl: vi.fn(() => notesUrl), check: vi.fn(async (): Promise<void> => undefined), start: vi.fn(async (): Promise<void> => undefined) };
  }

  it('without an update checker, getUpdate says null and the others do nothing', async () => {
    expect(await call(SETTINGS_CH.updateGet)).toBeNull();
    await call(SETTINGS_CH.updateCheck);
    await call(SETTINGS_CH.updateStart);
    await call(SETTINGS_CH.updateOpenRelease);
    expect(h.opened).toEqual([]);
  });

  it('getUpdate returns the state of the update checker', async () => {
    registerWith(fakeUpdate(AVAILABLE));
    expect(await call(SETTINGS_CH.updateGet)).toEqual(AVAILABLE);
  });

  it('checkForUpdates runs a check and waits for it', async () => {
    const u = fakeUpdate(AVAILABLE);
    let finish!: () => void;
    u.check.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    registerWith(u);
    let done = false;
    const p = call(SETTINGS_CH.updateCheck).then(() => (done = true));
    await Promise.resolve();
    expect(u.check).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    finish();
    await p;
    expect(done).toBe(true);
  });

  it('startUpdate starts the update and returns at once', async () => {
    const u = fakeUpdate(AVAILABLE);
    u.start.mockImplementation(() => new Promise<void>(() => undefined)); // an update takes minutes
    registerWith(u);
    await call(SETTINGS_CH.updateStart);
    expect(u.start).toHaveBeenCalledTimes(1);
  });

  it('startUpdate does not leave a rejection unhandled', async () => {
    const u = fakeUpdate(AVAILABLE);
    u.start.mockRejectedValue(new Error('boom'));
    registerWith(u);
    await expect(call(SETTINGS_CH.updateStart)).resolves.toBeUndefined();
  });

  it('openReleasePage opens the release notes of the version found', async () => {
    registerWith(fakeUpdate(AVAILABLE, NOTES));
    await call(SETTINGS_CH.updateOpenRelease);
    expect(h.opened).toEqual([NOTES]);
  });

  it('openReleasePage keeps opening the release notes after the download or the install failed', async () => {
    for (const state of [
      { phase: 'error', message: 'The download was damaged. Try again.', retry: 'download' },
      { phase: 'error', message: 'The update couldn’t be installed. Try again.', retry: 'download' },
      { phase: 'downloading', version: '0.5.1', percent: 3 },
      { phase: 'installing', version: '0.5.1' },
    ] as UpdateState[]) {
      h.opened.length = 0;
      registerWith(fakeUpdate(state, NOTES));
      await call(SETTINGS_CH.updateOpenRelease);
      expect(h.opened, state.phase).toEqual([NOTES]);
    }
  });

  it('openReleasePage opens the latest release when no version is known', async () => {
    for (const state of [
      { phase: 'idle', lastCheck: null },
      { phase: 'checking', manual: true },
      { phase: 'error', message: 'x', retry: 'check' },
    ] as UpdateState[]) {
      h.opened.length = 0;
      registerWith(fakeUpdate(state, null));
      await call(SETTINGS_CH.updateOpenRelease);
      expect(h.opened, state.phase).toEqual(['https://github.com/DreamingBetter/lolPing-moyudazi-Windows/releases/latest']);
    }
  });

  it('openReleasePage never opens a link that is not a web page', async () => {
    registerWith(fakeUpdate(AVAILABLE, 'file:///C:/Windows/System32/calc.exe'));
    await call(SETTINGS_CH.updateOpenRelease);
    expect(h.opened).toEqual(['https://github.com/DreamingBetter/lolPing-moyudazi-Windows/releases/latest']);
  });
});
