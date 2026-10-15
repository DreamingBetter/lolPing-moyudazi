import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmoteArt } from '../../src/shared/emotes';
import { OVERLAY_ACTIONED, OVERLAY_EMOTED, OVERLAY_HEARTSTEEL_CLAIM, OVERLAY_PINGED } from '../../src/shared/ipc';
import { DEFAULT_SETTINGS, overlaySettings } from '../../src/shared/settings';

const h = vi.hoisted(() => ({
  windows: [] as Array<{
    x: number;
    destroyed: boolean;
    webContents: { send: ReturnType<typeof vi.fn> };
    setShape: ReturnType<typeof vi.fn>;
    setIgnoreMouseEvents: ReturnType<typeof vi.fn>;
    page?: string;
  }>,
  handlers: new Map<string, (event: unknown, raw: unknown) => void>(),
}));

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeWindow extends Emitter {
    static fromWebContents(wc: unknown): FakeWindow | null {
      return (h.windows as unknown as FakeWindow[]).find((w) => w.webContents === wc) ?? null;
    }
    x: number;
    page?: string;
    destroyed = false;
    webContents = Object.assign(new Emitter(), { send: vi.fn() });
    setShape = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    constructor(opts: { x: number }) {
      super();
      this.x = opts.x;
      h.windows.push(this);
    }
    setAlwaysOnTop(): void {}
    setBounds(): void {}
    showInactive(): void {}
    isDestroyed(): boolean {
      return this.destroyed;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, scaleFactor: 1 },
  ];
  const screen = Object.assign(new Emitter(), {
    getAllDisplays: () => displays,
    getPrimaryDisplay: () => displays[0],
    dipToScreenRect: (_win: unknown, r: unknown) => r,
  });
  screen.setMaxListeners(0);
  const ipcMain = { on: (channel: string, fn: (event: unknown, raw: unknown) => void) => h.handlers.set(channel, fn) };
  return { BrowserWindow: FakeWindow, ipcMain, screen };
});

vi.mock('../../src/main/paths', () => ({
  IS_MAC: false,
  loadPage: (win: { page?: string }, page: string) => { win.page = page; return Promise.resolve(); },
  preloadPath: () => 'preload.js',
}));

type Manager = InstanceType<typeof import('../../src/main/overlayManager').OverlayManager>;
let mgr: Manager;
let resolveArt: ReturnType<typeof vi.fn<(ref: string, remote: boolean) => EmoteArt>>;

const art = (ref: string, remote: boolean): EmoteArt => ({ kind: 'bundled', slug: `${ref}${remote ? '-remote' : ''}` });
/** What display 1 (index 0) or display 2 (index 1) was told, minus the settings it gets on load. */
const sent = (i: number): Array<[string, unknown]> =>
  h.windows[i].webContents.send.mock.calls.filter((c) => c[0] !== 'overlay:settings') as Array<[string, unknown]>;

beforeEach(async () => {
  h.windows.length = 0;
  h.handlers.clear();
  vi.resetModules();
  const { OverlayManager } = await import('../../src/main/overlayManager');
  resolveArt = vi.fn(art);
  mgr = new OverlayManager(overlaySettings({ ...DEFAULT_SETTINGS, clickEmoteId: 'okay' }), resolveArt);
  mgr.start();
});

describe('OverlayManager wheels', () => {
  it('forwards the open wheel\'s kind with every move and the release', () => {
    mgr.handle({ type: 'wheelOpen', x: 100, y: 200, wheel: 'emote' });
    mgr.handle({ type: 'wheelMove', x: 110, y: 210, wheel: 'emote' });
    mgr.handle({ type: 'wheelRelease', x: 120, y: 220, wheel: 'emote' });
    expect(sent(0)).toEqual([
      ['wheel:open', { x: 100, y: 200, wheel: 'emote' }],
      ['wheel:move', { x: 110, y: 210, wheel: 'emote' }],
      ['wheel:release', { x: 120, y: 220, wheel: 'emote' }],
    ]);
  });

  it('keeps the ping wheel a ping wheel after an emote one', () => {
    mgr.handle({ type: 'wheelOpen', x: 1, y: 1, wheel: 'emote' });
    mgr.handle({ type: 'wheelRelease', x: 1, y: 1, wheel: 'emote' });
    mgr.handle({ type: 'wheelOpen', x: 5, y: 5, wheel: 'ping' });
    mgr.handle({ type: 'wheelMove', x: 6, y: 6, wheel: 'ping' });
    expect(sent(0).slice(2)).toEqual([
      ['wheel:open', { x: 5, y: 5, wheel: 'ping' }],
      ['wheel:move', { x: 6, y: 6, wheel: 'ping' }],
    ]);
  });

  it('forwards action wheel events and emits action reports', () => {
    const action = vi.fn();
    const sender = (i: number): unknown => h.windows[i].webContents;
    mgr.on('action', action);
    mgr.handle({ type: 'wheelOpen', x: 100, y: 200, wheel: 'action' });
    mgr.handle({ type: 'wheelMove', x: 110, y: 210, wheel: 'action' });
    mgr.handle({ type: 'wheelRelease', x: 120, y: 220, wheel: 'action' });
    expect(sent(0)).toEqual([
      ['wheel:open', { x: 100, y: 200, wheel: 'action' }],
      ['wheel:move', { x: 110, y: 210, wheel: 'action' }],
      ['wheel:release', { x: 120, y: 220, wheel: 'action' }],
    ]);
    h.handlers.get(OVERLAY_ACTIONED)!({ sender: sender(0) }, { id: 'action-0-screenshot', x: 10, y: 20 });
    expect(action).toHaveBeenCalledWith({ id: 'action-0-screenshot', displayId: 1, x: 10, y: 20 });
  });

  it('ignores malformed action reports', () => {
    const action = vi.fn();
    const sender = (i: number): unknown => h.windows[i].webContents;
    mgr.on('action', action);
    const report = h.handlers.get(OVERLAY_ACTIONED)!;
    for (const raw of [null, {}, { id: '', x: 1, y: 2 }, { id: 'a', x: '1', y: 2 }, { id: 'a', x: 1, y: Number.NaN }]) {
      report({ sender: sender(0) }, raw);
    }
    report({ sender: {} }, { id: 'a', x: 1, y: 2 });
    expect(action).not.toHaveBeenCalled();
  });
});

describe('OverlayManager emote clicks', () => {
  it('shows the click emote where it was clicked, clears ours on the other displays and shares it', () => {
    const shared = vi.fn();
    mgr.on('sharedEmote', shared);
    mgr.on('shared', shared);
    mgr.handle({ type: 'click', x: 1920 + 300, y: 400, wheel: 'emote' });
    expect(sent(1)).toEqual([['emote:spawn', { owner: 'self', art: art('okay', false), x: 300, y: 400 }]]);
    expect(sent(0)).toEqual([['emote:clear', { owner: 'self' }]]);
    expect(resolveArt).toHaveBeenCalledWith('okay', false);
    expect(shared).toHaveBeenCalledOnce();
    expect(shared).toHaveBeenCalledWith({ ref: 'okay', displayId: 2, x: 300, y: 400 });
  });

  it('still drops the click ping for a ping click', () => {
    const emoted = vi.fn();
    const pinged = vi.fn();
    mgr.on('sharedEmote', emoted);
    mgr.on('shared', pinged);
    mgr.handle({ type: 'click', x: 50, y: 60, wheel: 'ping' });
    expect(sent(0)).toEqual([['ping:spawn', { id: DEFAULT_SETTINGS.clickPingId, x: 50, y: 60 }]]);
    expect(sent(1)).toEqual([]);
    expect(emoted).not.toHaveBeenCalled();
    expect(pinged).toHaveBeenCalledOnce();
  });
});

describe('OverlayManager emote reports from the overlay', () => {
  const sender = (i: number): unknown => h.windows[i].webContents;

  it('shares a wheel emote from the display that placed it and clears ours elsewhere', () => {
    const shared = vi.fn();
    mgr.on('sharedEmote', shared);
    h.handlers.get(OVERLAY_EMOTED)!({ sender: sender(1) }, { ref: 'c:' + 'a'.repeat(32), x: 10, y: 20 });
    expect(shared).toHaveBeenCalledWith({ ref: 'c:' + 'a'.repeat(32), displayId: 2, x: 10, y: 20 });
    expect(sent(0)).toEqual([['emote:clear', { owner: 'self' }]]);
    expect(sent(1)).toEqual([]);
  });

  it('ignores a malformed report', () => {
    const shared = vi.fn();
    mgr.on('sharedEmote', shared);
    const report = h.handlers.get(OVERLAY_EMOTED)!;
    for (const raw of [
      null, 'x', 5, {}, { ref: 'Bad Ref', x: 1, y: 1 }, { ref: 'c:abc', x: 1, y: 1 }, { ref: 'okay', x: Number.NaN, y: 1 },
      { ref: 'okay', x: 1, y: Infinity }, { ref: 'okay', x: '1', y: 1 }, { ref: 7, x: 1, y: 1 },
    ]) report({ sender: sender(0) }, raw);
    report({ sender: {} }, { ref: 'okay', x: 1, y: 1 }); // not one of our windows
    expect(shared).not.toHaveBeenCalled();
    expect(sent(0)).toEqual([]);
    expect(sent(1)).toEqual([]);
  });

  it('still shares pings', () => {
    const shared = vi.fn();
    mgr.on('shared', shared);
    h.handlers.get(OVERLAY_PINGED)!({ sender: sender(0) }, { id: 'danger', x: 1, y: 2 });
    expect(shared).toHaveBeenCalledWith({ id: 'danger', displayId: 1, x: 1, y: 2 });
  });
});

describe('OverlayManager remote and preview emotes', () => {
  it('shows a room member\'s emote on the target display with their tag, and clears theirs on the others', () => {
    mgr.spawnRemoteEmote({ displayId: 2, x: 5, y: 6, ref: 'gg_heart', peer: 'peer-1', tag: { name: 'Bob', color: 2 } });
    expect(resolveArt).toHaveBeenCalledWith('gg_heart', true);
    expect(sent(1)).toEqual([['emote:spawn', { owner: 'peer-1', art: art('gg_heart', true), x: 5, y: 6, tag: { name: 'Bob', color: 2 } }]]);
    expect(sent(0)).toEqual([['emote:clear', { owner: 'peer-1' }]]);
  });

  it('previews in the middle of the main display without sharing', () => {
    const shared = vi.fn();
    mgr.on('sharedEmote', shared);
    mgr.previewEmote('nice');
    expect(resolveArt).toHaveBeenCalledWith('nice', false);
    expect(sent(0)).toEqual([['emote:spawn', { owner: 'preview', art: art('nice', false), x: 960, y: 540 }]]);
    expect(sent(1)).toEqual([]);
    expect(shared).not.toHaveBeenCalled();
  });
});

describe('OverlayManager chat danmaku', () => {
  it('spawns chat danmaku on the primary display only', () => {
    mgr.spawnChatDanmaku({ id: 'm1', peer: 'p1', name: 'Alex', color: 4, ts: 1, text: 'hello', self: false });
    expect(sent(0)).toEqual([['chat:spawn', { id: 'm1', name: 'Alex', color: 4, text: 'hello' }]]);
    expect(sent(1)).toEqual([]);
  });

  it('drops chat danmaku when the primary overlay is destroyed', () => {
    h.windows[0].destroyed = true;
    mgr.spawnChatDanmaku({ id: 'm2', peer: 'p1', name: 'Alex', color: 4, ts: 1, text: 'dropped', self: false });
    expect(sent(0)).toEqual([]);
    expect(sent(1)).toEqual([]);
  });
});

describe('OverlayManager Heartsteel targets', () => {
  it('keeps target clicks active while a ping or emote renders across the full display', () => {
    expect(h.windows).toHaveLength(4);
    const visual = h.windows[0];
    const hit = h.windows[2];
    expect(visual.page).toBe('overlay');
    expect(hit.page).toBe('heartsteel-hit');
    mgr.showHeartsteelTarget({ displayId: 1, id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5000, cursor: 'modern' });

    mgr.spawnRemote({ displayId: 1, x: 320, y: 240, id: 'danger', tag: { name: 'Bob', color: 2 } });
    expect(visual.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
    expect(visual.setShape).not.toHaveBeenCalled();
    expect(hit.setShape).toHaveBeenLastCalledWith([{ x: 52, y: 152, width: 96, height: 96 }]);
    expect(hit.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);

    mgr.spawnRemoteEmote({ displayId: 1, x: 330, y: 250, ref: 'gg_heart', peer: 'peer-1', tag: { name: 'Bob', color: 2 } });
    expect(hit.setShape).toHaveBeenLastCalledWith([{ x: 52, y: 152, width: 96, height: 96 }]);
    expect(hit.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  it('shows a target, opens only a small hit shape, and clears it back to click-through', () => {
    mgr.showHeartsteelTarget({ displayId: 1, id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5, cursor: 'modern' });
    expect(sent(0)).toEqual([['heartsteel:target', { id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5, cursor: 'modern' }]]);
    expect(h.windows[2].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(h.windows[2].setShape).toHaveBeenLastCalledWith([{ x: 52, y: 152, width: 96, height: 96 }]);
    expect(h.windows[2].webContents.send).toHaveBeenLastCalledWith('heartsteel:target', {
      id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5, cursor: 'modern',
    });

    mgr.clearHeartsteelTarget('1'.repeat(32));
    expect(sent(0).at(-1)).toEqual(['heartsteel:clear', { id: '1'.repeat(32) }]);
    expect(h.windows[2].setShape).toHaveBeenLastCalledWith([]);
    expect(h.windows[2].setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
  });

  it('keeps hit shapes for multiple Heartsteel targets on the same display', () => {
    mgr.showHeartsteelTarget({ displayId: 1, id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5, cursor: 'modern' });
    mgr.showHeartsteelTarget({ displayId: 1, id: '2'.repeat(32), x: 300, y: 400, expiresAt: 6, cursor: 'modern' });

    expect(h.windows[2].setShape).toHaveBeenLastCalledWith([
      { x: 52, y: 152, width: 96, height: 96 },
      { x: 252, y: 352, width: 96, height: 96 },
    ]);
    mgr.clearHeartsteelTarget('1'.repeat(32));
    expect(h.windows[2].setShape).toHaveBeenLastCalledWith([{ x: 252, y: 352, width: 96, height: 96 }]);
    expect(h.windows[2].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  it('restores target clicks as soon as a wheel is released', () => {
    mgr.showHeartsteelTarget({ displayId: 1, id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5000, cursor: 'modern' });
    mgr.handle({ type: 'wheelOpen', x: 500, y: 500, wheel: 'ping' });
    expect(h.windows[2].setShape).toHaveBeenLastCalledWith([]);
    expect(h.windows[2].setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);

    mgr.handle({ type: 'wheelRelease', x: 560, y: 540, wheel: 'ping' });
    expect(h.windows[2].setShape).toHaveBeenLastCalledWith([{ x: 52, y: 152, width: 96, height: 96 }]);
    expect(h.windows[2].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  it('keeps remaining targets clickable while Heartsteel hit feedback renders', () => {
    mgr.showHeartsteelTarget({ displayId: 1, id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5000, cursor: 'modern' });
    mgr.showHeartsteelTarget({ displayId: 1, id: '2'.repeat(32), x: 300, y: 400, expiresAt: 6000, cursor: 'modern' });

    mgr.showHeartsteelHit({
      displayId: 1, id: '1'.repeat(32), x: 100, y: 200,
      winnerName: 'Alex', winnerColor: 2, damage: 185, bonusGain: 19,
    });
    mgr.clearHeartsteelTarget('1'.repeat(32));

    expect(sent(0).at(-2)).toEqual([
      'heartsteel:hit',
      { id: '1'.repeat(32), x: 100, y: 200, winnerName: 'Alex', winnerColor: 2, damage: 185, bonusGain: 19 },
    ]);
    expect(h.windows[2].setShape).toHaveBeenLastCalledWith([{ x: 252, y: 352, width: 96, height: 96 }]);
    expect(h.windows[2].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  it('emits a Heartsteel claim report from the target display', () => {
    const claim = vi.fn();
    mgr.on('heartsteelClaim', claim);
    h.handlers.get(OVERLAY_HEARTSTEEL_CLAIM)!({ sender: h.windows[3].webContents }, { id: '2'.repeat(32), x: 10, y: 20 });
    expect(claim).toHaveBeenCalledWith({ id: '2'.repeat(32), displayId: 2, x: 10, y: 20 });
  });
});
