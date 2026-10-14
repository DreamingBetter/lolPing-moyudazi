import { BrowserWindow, screen } from 'electron';
import { SETTINGS_CH } from '../shared/settingsChannels';
import type { RoomState } from '../shared/room';
import type { DesktopWidgetPosition, Settings } from '../shared/settings';
import { IS_MAC, loadPage, preloadPath } from './paths';

const WIDGET_WIDTH = 304;
const WIDGET_HEIGHT = 80;
const DEFAULT_MARGIN = 16;

export class HeartsteelWidgetWindow {
  private win: BrowserWindow | null = null;
  private settings: Settings | null = null;
  private room: RoomState | null = null;

  constructor(private readonly savePosition: (position: DesktopWidgetPosition) => void) {}

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.sync();
  }

  setRoom(room: RoomState): void {
    this.room = room;
    this.sync();
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }

  private sync(): void {
    if (!this.settings?.heartsteelWidgetEnabled) {
      this.destroy();
      return;
    }
    const win = this.ensureWindow(this.settings);
    win.webContents.send(SETTINGS_CH.changed, this.settings);
    if (this.room) win.webContents.send(SETTINGS_CH.roomChanged, this.room);
  }

  private ensureWindow(settings: Settings): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const pos = settings.heartsteelWidgetPosition ?? defaultPosition();
    const win = new BrowserWindow({
      x: pos.x,
      y: pos.y,
      width: WIDGET_WIDTH,
      height: WIDGET_HEIGHT,
      minWidth: WIDGET_WIDTH,
      minHeight: WIDGET_HEIGHT,
      maxWidth: WIDGET_WIDTH,
      maxHeight: WIDGET_HEIGHT,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      type: IS_MAC ? 'panel' : 'toolbar',
      webPreferences: { preload: preloadPath('settings'), spellcheck: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    if (!IS_MAC) win.removeMenu();
    if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.on('moved', () => {
      if (win.isDestroyed()) return;
      const b = win.getBounds();
      this.savePosition({ x: b.x, y: b.y });
    });
    win.once('ready-to-show', () => win.showInactive());
    void loadPage(win, 'heartsteel-widget');
    this.win = win;
    return win;
  }
}

function defaultPosition(): DesktopWidgetPosition {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + area.width - WIDGET_WIDTH - DEFAULT_MARGIN),
    y: Math.round(area.y + DEFAULT_MARGIN),
  };
}
