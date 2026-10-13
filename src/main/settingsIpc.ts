import { app, dialog, globalShortcut, ipcMain, net, shell } from 'electron';
import { Buffer } from 'node:buffer';
import { actionCustomIconUrl } from '../shared/actions';
import { isCustomRef, isEmoteRefShape, type EmoteRef, type ImportResult } from '../shared/emotes';
import type { Strings } from '../shared/i18n';
import { SETTINGS_CH, type About, type AppStatus, type SetSettingsResult } from '../shared/ipc';
import { hotkeyLabel, hotkeyToAccelerator, type Hotkey } from '../shared/keys';
import { pingById, type PingId } from '../shared/pings';
import type { Platform } from '../shared/platform';
import type { JoinResult, RoomState } from '../shared/room';
import type { ChatSendResult, RoomChatState } from '../shared/roomChat';
import { patchClashes, rendererPatch, type Settings } from '../shared/settings';
import type { UpdateState } from '../shared/update';
import type { CursorSkinResult, CursorSkinVariant } from './cursorSkin';
import { emoteFileFrom, type EmoteLibrary } from './emoteLibrary';
import type { SettingsStore } from './settingsStore';

const PROJECT_URL = 'https://github.com/darrenprx/lolPing';
/** Where "What's new" goes when no update is known. */
export const LATEST_RELEASE_URL = `${PROJECT_URL}/releases/latest`;
const ACTION_ICON_MAX_BYTES = 100_000;
const ACTION_ICON_HTML_MAX_BYTES = 200_000;
const ACTION_ICON_TIMEOUT_MS = 1500;
const IMAGE_MIME_BY_EXT = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
]);
const IMAGE_MIMES = new Set([...IMAGE_MIME_BY_EXT.values(), 'image/vnd.microsoft.icon']);

export interface SettingsIpcDeps {
  store: SettingsStore;
  /** Imported emotes' files. Only the import and remove handlers change `customEmotes`. */
  library: EmoteLibrary;
  getStatus(): AppStatus;
  setEnabled(on: boolean): void;
  preview(id: PingId): void;
  previewEmote(ref: EmoteRef): void;
  about(): About;
  retryHelper(): void;
  setCapturing(on: boolean): void;
  openAccessibility(): void;
  /** Strings in the app's current language. */
  text(): Strings;
  platform: Platform;
  /** Windows system cursor skin switcher. Omitted on platforms that cannot change Windows cursors. */
  cursorSkin?: {
    applySummoner(variant?: CursorSkinVariant): Promise<CursorSkinResult>;
    restoreOriginal(): Promise<CursorSkinResult>;
  };
  /** The update checker. Absent in a development build without LOLPING_UPDATE_TEST_URL: the page then shows no update controls. */
  update?: {
    state(): UpdateState;
    /** The release notes link of the update that was found, kept through a failed download or install; null when none is known. */
    notesUrl(): string | null;
    /** A manual check. */
    check(): Promise<void>;
    /** Downloads and installs; settles when the install has been handed over, which is minutes later. */
    start(): Promise<void>;
  };
  room: {
    state(): RoomState;
    create(): Promise<void>;
    join(text: string): Promise<JoinResult>;
    leave(): void;
    mute(peer: string, on: boolean): void;
    clipboardCode(): Promise<string | null>;
    copyCode(): void;
    retryInternet(): void;
    chatState(): RoomChatState;
    sendChat(text: string): ChatSendResult;
    retryChat(id: string): ChatSendResult;
  };
  showSection?(section: string): void;
}

/** Returns an error message when another app already owns this shortcut. */
function hotkeyConflict(next: Hotkey, current: Hotkey, text: Strings, platform: Platform): string | null {
  if (next.mods === current.mods && next.vk === current.vk) return null;
  const accelerator = hotkeyToAccelerator(next);
  if (!accelerator) return null;
  try {
    const free = globalShortcut.register(accelerator, () => undefined);
    if (free) globalShortcut.unregister(accelerator);
    return free ? null : text.hotkeyTaken(hotkeyLabel(next, platform));
  } catch {
    return null;
  }
}

async function cursorSkinError(d: SettingsIpcDeps, patch: Partial<Settings>): Promise<string | null> {
  const changesEnabled = Object.prototype.hasOwnProperty.call(patch, 'cursorSkinEnabled') && typeof patch.cursorSkinEnabled === 'boolean';
  const changesClassic = Object.prototype.hasOwnProperty.call(patch, 'cursorSkinClassic') && typeof patch.cursorSkinClassic === 'boolean';
  if (!changesEnabled && !changesClassic) return null;
  const current = d.store.get();
  const nextEnabled = changesEnabled ? patch.cursorSkinEnabled === true : current.cursorSkinEnabled;
  const nextClassic = changesClassic ? patch.cursorSkinClassic === true : current.cursorSkinClassic;
  if (nextEnabled === current.cursorSkinEnabled && nextClassic === current.cursorSkinClassic) return null;
  if (!nextEnabled && !changesEnabled) return null;
  if (!d.cursorSkin) return d.text().cursorSkinFailed;
  try {
    const result = nextEnabled ? await d.cursorSkin.applySummoner(nextClassic ? 'classic' : 'modern') : await d.cursorSkin.restoreOriginal();
    return result.ok ? null : result.error || d.text().cursorSkinFailed;
  } catch (e) {
    return e instanceof Error ? e.message : d.text().cursorSkinFailed;
  }
}

export function registerSettingsIpc(d: SettingsIpcDeps): void {
  // Imports and removals run one at a time, so each sees the list the one before it left (the duplicate and full checks).
  let emoteQueue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = emoteQueue.then(fn);
    emoteQueue = run.catch(() => undefined);
    return run;
  };

  ipcMain.handle(SETTINGS_CH.get, () => d.store.get());
  ipcMain.handle(SETTINGS_CH.set, async (_e, raw: unknown): Promise<SetSettingsResult> => {
    const patch = rendererPatch(raw);
    if (patchClashes(d.store.get(), patch, d.platform)) {
      return { ok: false, error: d.text().actionKeyClash, settings: d.store.get() };
    }
    if (patch.toggleHotkey) {
      const error = hotkeyConflict(patch.toggleHotkey, d.store.get().toggleHotkey, d.text(), d.platform);
      if (error) return { ok: false, error, settings: d.store.get() };
    }
    const cursorError = await cursorSkinError(d, patch);
    if (cursorError) return { ok: false, error: cursorError, settings: d.store.get() };
    return { ok: true, settings: d.store.update(patch) };
  });
  ipcMain.handle(SETTINGS_CH.status, () => d.getStatus());
  ipcMain.handle(SETTINGS_CH.setEnabled, (_e, on: unknown) => d.setEnabled(on === true));
  ipcMain.handle(SETTINGS_CH.preview, (_e, id: unknown) => {
    const p = typeof id === 'string' ? pingById(id) : undefined;
    if (p) d.preview(p.id);
  });
  ipcMain.handle(SETTINGS_CH.previewEmote, (_e, ref: unknown) => {
    if (isEmoteRefShape(ref)) d.previewEmote(ref);
  });
  ipcMain.handle(SETTINGS_CH.emoteImport, (_e, raw: unknown) => oneAtATime(async (): Promise<ImportResult> => {
    const file = emoteFileFrom(raw);
    if (!file) return { ok: false, error: 'type' };
    const saved = await d.library.save(file, d.store.get().customEmotes);
    if (!saved.ok) return { ok: false, error: saved.error };
    d.store.update({ customEmotes: [...d.store.get().customEmotes, saved.emote] });
    return { ok: true, id: saved.emote.id };
  }));
  ipcMain.handle(SETTINGS_CH.emoteRemove, (_e, id: unknown) => oneAtATime(async () => {
    if (!isCustomRef(id)) return;
    await d.library.remove(id);
    // Normalising the shorter list puts each wheel slot (and the click emote) that used it back to a default.
    d.store.update({ customEmotes: d.store.get().customEmotes.filter((c) => c.id !== id) });
  }));
  ipcMain.handle(SETTINGS_CH.about, () => d.about());
  ipcMain.handle(SETTINGS_CH.openFolder, async () => {
    await shell.openPath(d.store.dir);
  });
  ipcMain.handle(SETTINGS_CH.openProject, async () => {
    await shell.openExternal(PROJECT_URL);
  });
  ipcMain.handle(SETTINGS_CH.pickFile, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(SETTINGS_CH.pickFolder, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle(SETTINGS_CH.actionFileIcon, (_e, raw: unknown): Promise<string | null> => fileIconDataUrl(raw));
  ipcMain.handle(SETTINGS_CH.actionUrlIcon, (_e, raw: unknown): Promise<string | null> => urlIconDataUrl(raw));
  ipcMain.handle(SETTINGS_CH.retryHelper, () => d.retryHelper());
  ipcMain.handle(SETTINGS_CH.capture, (_e, on: unknown) => d.setCapturing(on === true));
  ipcMain.handle(SETTINGS_CH.openAccessibility, () => d.openAccessibility());
  ipcMain.handle(SETTINGS_CH.roomGet, () => d.room.state());
  ipcMain.handle(SETTINGS_CH.roomCreate, async () => {
    await d.room.create();
    d.showSection?.('chat');
  });
  ipcMain.handle(SETTINGS_CH.roomJoin, async (_e, text: unknown): Promise<JoinResult> => {
    if (typeof text !== 'string') return { ok: false, error: 'invalid' };
    const result = await d.room.join(text);
    if (result.ok) d.showSection?.('chat');
    return result;
  });
  ipcMain.handle(SETTINGS_CH.roomLeave, () => d.room.leave());
  ipcMain.handle(SETTINGS_CH.roomMute, (_e, peer: unknown, on: unknown) => {
    if (typeof peer === 'string') d.room.mute(peer, on === true);
  });
  ipcMain.handle(SETTINGS_CH.roomClipboard, () => d.room.clipboardCode());
  ipcMain.handle(SETTINGS_CH.roomCopy, () => d.room.copyCode());
  ipcMain.handle(SETTINGS_CH.roomRetryInternet, () => d.room.retryInternet());
  ipcMain.handle(SETTINGS_CH.roomChatGet, () => d.room.chatState());
  ipcMain.handle(SETTINGS_CH.roomChatSend, (_e, text: unknown): ChatSendResult =>
    typeof text === 'string' ? d.room.sendChat(text) : { ok: false, error: 'empty' });
  ipcMain.handle(SETTINGS_CH.roomChatRetry, (_e, id: unknown): ChatSendResult =>
    typeof id === 'string' ? d.room.retryChat(id) : { ok: false, error: 'failed' });

  ipcMain.handle(SETTINGS_CH.updateGet, (): UpdateState | null => d.update?.state() ?? null);
  ipcMain.handle(SETTINGS_CH.updateCheck, async () => {
    await d.update?.check();
  });
  ipcMain.handle(SETTINGS_CH.updateStart, () => {
    // Not awaited: the page follows the download through update:state, and this call would otherwise stay open for minutes.
    d.update?.start().catch(() => undefined);
  });
  ipcMain.handle(SETTINGS_CH.updateOpenRelease, async () => {
    if (!d.update) return;
    const notes = d.update.notesUrl();
    await shell.openExternal(notes !== null && isWebUrl(notes) ? notes : LATEST_RELEASE_URL);
  });
}

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

async function fileIconDataUrl(raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const image = await app.getFileIcon(raw.trim(), { size: 'normal' });
    if (image.isEmpty()) return null;
    return actionCustomIconUrl(image.toDataURL()) ?? null;
  } catch {
    return null;
  }
}

function mimeFrom(url: string, header: string | null): string | null {
  const mime = header?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (IMAGE_MIMES.has(mime)) return mime === 'image/vnd.microsoft.icon' ? 'image/x-icon' : mime;
  const path = new URL(url).pathname.toLowerCase();
  for (const [ext, byExt] of IMAGE_MIME_BY_EXT) {
    if (path.endsWith(ext)) return byExt;
  }
  return null;
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), ACTION_ICON_TIMEOUT_MS);
  try {
    return await net.fetch(url, { signal: abort.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function tooLarge(res: Response, limit: number): boolean {
  const raw = res.headers.get('content-length');
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > limit;
}

async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res?.ok || tooLarge(res, ACTION_ICON_MAX_BYTES)) return null;
    const mime = mimeFrom(url, res.headers.get('content-type'));
    if (!mime) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > ACTION_ICON_MAX_BYTES) return null;
    return actionCustomIconUrl(`data:${mime};base64,${bytes.toString('base64')}`) ?? null;
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i');
  const m = re.exec(tag);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? null;
}

function iconLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attr(tag, 'rel')?.toLowerCase() ?? '';
    if (!/\b(?:icon|apple-touch-icon)\b/.test(rel)) continue;
    const href = attr(tag, 'href');
    if (!href) continue;
    try {
      out.push(new URL(href, base).toString());
    } catch {
      // Ignore broken site markup.
    }
  }
  return [...new Set(out)].slice(0, 6);
}

async function homepageIconLinks(home: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(home);
    if (!res?.ok || tooLarge(res, ACTION_ICON_HTML_MAX_BYTES)) return [];
    const mime = res.headers.get('content-type')?.toLowerCase() ?? '';
    if (mime && !mime.includes('text/html')) return [];
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > ACTION_ICON_HTML_MAX_BYTES) return [];
    return iconLinks(bytes.toString('utf8'), home);
  } catch {
    return [];
  }
}

async function urlIconDataUrl(raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string' || !isWebUrl(raw)) return null;
  const url = new URL(raw);
  const home = new URL('/', url.origin).toString();
  const rootIcon = await fetchImageDataUrl(new URL('/favicon.ico', url.origin).toString());
  if (rootIcon) return rootIcon;
  const icons = await Promise.all((await homepageIconLinks(home)).map((link) => fetchImageDataUrl(link)));
  return icons.find((icon): icon is string => icon !== null) ?? null;
}
