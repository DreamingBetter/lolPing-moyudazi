import type { ActionSlot } from '../shared/actions';
import type { Platform } from '../shared/platform';

export type ActionFailureReason = 'missingConfig' | 'invalidUrl' | 'pathMissing' | 'openFailed' | 'unsupported';
export type ActionResult = { ok: true } | { ok: false; reason: ActionFailureReason; message?: string };

export interface ActionExecutorDeps {
  platform: Platform;
  openDefaultBrowser(): Promise<void>;
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  run(command: string, args: string[]): Promise<void>;
  writeClipboard(text: string): void;
  injectKeys(keys: number[]): void;
  exists(path: string): boolean;
  now(): Date;
  paths: { home: string; desktop: string; downloads: string };
}

const pathParam = (slot: ActionSlot): string | null => {
  const path = slot.params?.path?.trim();
  return path ? path : null;
};

const urlParam = (slot: ActionSlot): string | null => {
  const raw = slot.params?.url?.trim();
  return raw ? raw : null;
};

function webUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

async function openPath(path: string, deps: ActionExecutorDeps): Promise<ActionResult> {
  if (!deps.exists(path)) return { ok: false, reason: 'pathMissing' };
  const error = await deps.openPath(path);
  return error ? { ok: false, reason: 'openFailed', message: error } : { ok: true };
}

export async function executeAction(slot: ActionSlot, deps: ActionExecutorDeps): Promise<ActionResult> {
  const windowsOnly: readonly ActionSlot['kind'][] = ['screenshot', 'showDesktop', 'lockScreen', 'muteToggle', 'volumeUp', 'volumeDown'];
  if (deps.platform !== 'win' && windowsOnly.includes(slot.kind)) return { ok: false, reason: 'unsupported' };

  switch (slot.kind) {
    case 'screenshot':
      deps.injectKeys([0x5b, 0x10, 0x53]);
      return { ok: true };
    case 'showDesktop':
      deps.injectKeys([0x5b, 0x44]);
      return { ok: true };
    case 'lockScreen':
      await deps.run('rundll32.exe', ['user32.dll,LockWorkStation']);
      return { ok: true };
    case 'muteToggle':
      deps.injectKeys([0xad]);
      return { ok: true };
    case 'volumeUp':
      deps.injectKeys([0xaf]);
      return { ok: true };
    case 'volumeDown':
      deps.injectKeys([0xae]);
      return { ok: true };
    case 'openBrowser':
      await deps.openDefaultBrowser();
      return { ok: true };
    case 'openUrl': {
      const raw = urlParam(slot);
      if (!raw) return { ok: false, reason: 'missingConfig' };
      const url = webUrl(raw);
      if (!url) return { ok: false, reason: 'invalidUrl' };
      await deps.openExternal(url);
      return { ok: true };
    }
    case 'openApp':
    case 'openFile':
    case 'openFolder': {
      const path = pathParam(slot);
      return path ? openPath(path, deps) : { ok: false, reason: 'missingConfig' };
    }
    case 'openDownloads':
      return openPath(deps.paths.downloads, deps);
    case 'openDesktop':
      return openPath(deps.paths.desktop, deps);
    case 'openHome':
      return openPath(deps.paths.home, deps);
  }
}
