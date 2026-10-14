import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '../../src/shared/room';
import { SETTINGS_CH } from '../../src/shared/settingsChannels';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

const h = vi.hoisted(() => ({
  windows: [] as Array<{
    destroyed: boolean;
    bounds: { x: number; y: number; width: number; height: number };
    webContents: { send: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; setWindowOpenHandler: ReturnType<typeof vi.fn> };
    onceHandlers: Map<string, () => void>;
    handlers: Map<string, () => void>;
  }>,
}));

vi.mock('electron', async () => {
  class FakeWindow {
    destroyed = false;
    bounds: { x: number; y: number; width: number; height: number };
    webContents = { send: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() };
    onceHandlers = new Map<string, () => void>();
    handlers = new Map<string, () => void>();
    constructor(opts: { x: number; y: number; width: number; height: number }) {
      this.bounds = { x: opts.x, y: opts.y, width: opts.width, height: opts.height };
      h.windows.push(this);
    }
    removeMenu(): void {}
    setAlwaysOnTop(): void {}
    setVisibleOnAllWorkspaces(): void {}
    showInactive(): void {}
    once(event: string, fn: () => void): void {
      this.onceHandlers.set(event, fn);
    }
    on(event: string, fn: () => void): void {
      this.handlers.set(event, fn);
    }
    getBounds(): { x: number; y: number; width: number; height: number } {
      return this.bounds;
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }
  const screen = {
    getPrimaryDisplay: () => ({ workArea: { x: 20, y: 40, width: 1200, height: 800 } }),
  };
  return { BrowserWindow: FakeWindow, screen };
});

vi.mock('../../src/main/paths', () => ({
  IS_MAC: false,
  loadPage: vi.fn(() => Promise.resolve()),
  preloadPath: () => 'settings-preload.js',
}));

const room = (): RoomState => ({
  phase: 'idle',
  code: null,
  members: [{
    peer: 'self',
    name: 'Me',
    color: 1,
    path: 'lan',
    status: 'on',
    needsUpdate: false,
    noEmotes: false,
    muted: false,
    heartsteelBonusHealth: 25,
    heartsteelMaxHealth: 2025,
    self: true,
  }],
  heartsteel: { enabled: true, target: null, lastHit: null },
  lan: 'off',
  internet: 'off',
  lonely: false,
  clockSkew: false,
  displays: [],
});

describe('HeartsteelWidgetWindow', () => {
  beforeEach(() => {
    h.windows.length = 0;
    vi.resetModules();
  });

  it('opens only when enabled and sends settings plus room state', async () => {
    const { HeartsteelWidgetWindow } = await import('../../src/main/heartsteelWidgetWindow');
    const widget = new HeartsteelWidgetWindow(vi.fn());
    widget.setSettings({ ...DEFAULT_SETTINGS, heartsteelWidgetEnabled: false });
    widget.setRoom(room());
    expect(h.windows).toHaveLength(0);

    widget.setSettings({ ...DEFAULT_SETTINGS, heartsteelWidgetEnabled: true, heartsteelWidgetPosition: { x: 10, y: 12 } });
    expect(h.windows).toHaveLength(1);
    expect(h.windows[0].bounds).toMatchObject({ x: 10, y: 12 });
    expect(h.windows[0].webContents.send).toHaveBeenCalledWith(SETTINGS_CH.changed, expect.objectContaining({ heartsteelWidgetEnabled: true }));
    expect(h.windows[0].webContents.send).toHaveBeenCalledWith(SETTINGS_CH.roomChanged, expect.objectContaining({ heartsteel: { enabled: true, target: null, lastHit: null } }));
  });

  it('saves the dragged position and closes when disabled', async () => {
    const save = vi.fn();
    const { HeartsteelWidgetWindow } = await import('../../src/main/heartsteelWidgetWindow');
    const widget = new HeartsteelWidgetWindow(save);
    widget.setSettings({ ...DEFAULT_SETTINGS, heartsteelWidgetEnabled: true, heartsteelWidgetPosition: null });
    expect(h.windows[0].bounds).toMatchObject({ x: 900, y: 56 });

    h.windows[0].bounds.x = 44;
    h.windows[0].bounds.y = 55;
    h.windows[0].handlers.get('moved')!();
    expect(save).toHaveBeenCalledWith({ x: 44, y: 55 });

    widget.setSettings({ ...DEFAULT_SETTINGS, heartsteelWidgetEnabled: false });
    expect(h.windows[0].destroyed).toBe(true);
  });
});
