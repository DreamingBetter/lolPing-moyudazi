import { volumeStepToMediaKeyPresses, type ActionSlot } from '../shared/actions';
import type { Platform } from '../shared/platform';

export type ActionFailureReason = 'missingConfig' | 'invalidUrl' | 'pathMissing' | 'openFailed' | 'unsupported';
export type ActionResult = { ok: true } | { ok: false; reason: ActionFailureReason; message?: string };
export const DEFAULT_BROWSER_URL = 'https://www.bing.com/';

export interface ActionExecutorDeps {
  platform: Platform;
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  run(command: string, args: string[]): Promise<void>;
  injectKeys(keys: number[]): void;
  exists(path: string): boolean;
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

function injectMediaKey(keys: number[], slot: ActionSlot, deps: ActionExecutorDeps): void {
  const count = volumeStepToMediaKeyPresses(slot.params?.volumeStep);
  for (let i = 0; i < count; i += 1) deps.injectKeys(keys);
}

export async function executeAction(slot: ActionSlot, deps: ActionExecutorDeps): Promise<ActionResult> {
  const windowsOnly: readonly ActionSlot['kind'][] = ['screenshot', 'showDesktop', 'lockScreen', 'muteToggle', 'volumeUp', 'volumeDown'];
  if (deps.platform !== 'win' && windowsOnly.includes(slot.kind)) return { ok: false, reason: 'unsupported' };

  switch (slot.kind) {
    case 'screenshot':
      deps.injectKeys([0x5b, 0x10, 0x53]);
      return { ok: true };
    case 'showDesktop':
      await deps.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', '(New-Object -ComObject Shell.Application).ToggleDesktop()']);
      return { ok: true };
    case 'lockScreen':
      await deps.run('rundll32.exe', ['user32.dll,LockWorkStation']);
      return { ok: true };
    case 'muteToggle':
      deps.injectKeys([0xad]);
      return { ok: true };
    case 'volumeUp':
      injectMediaKey([0xaf], slot, deps);
      return { ok: true };
    case 'volumeDown':
      injectMediaKey([0xae], slot, deps);
      return { ok: true };
    case 'openBrowser':
      await deps.openExternal(DEFAULT_BROWSER_URL);
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
  }
}
