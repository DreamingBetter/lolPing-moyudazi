import type { Settings } from './settings';

/** Which wheel a gesture belongs to: the ping trigger's, the emote key's, or the action key's. */
export type WheelKind = 'ping' | 'emote' | 'action';

/**
 * Messages the hook helper writes to stdout, one JSON object per line.
 * Coordinates are physical pixels on Windows and global points (Electron DIPs) on macOS.
 */
export type HelperEvent =
  | { type: 'ready'; version: number }
  | { type: 'wheelOpen' | 'wheelMove' | 'wheelRelease' | 'click'; x: number; y: number; wheel: WheelKind }
  | { type: 'cancel' }
  | { type: 'toggled'; enabled: boolean }
  | { type: 'error'; message: string; code?: string }
  | { type: 'sim'; swallow: boolean; inject: string };

/** `noAccess`: macOS hasn't given lolPing Accessibility access, so the helper can't run. */
export type HelperStatus = 'starting' | 'running' | 'failed' | 'noAccess';

/** The helper's exit code when it can't create its event tap (macOS Accessibility access missing). */
export const HELPER_EXIT_NO_ACCESS = 3;

type PointType = 'wheelOpen' | 'wheelMove' | 'wheelRelease' | 'click';
const POINT_TYPES = new Set<string>(['wheelOpen', 'wheelMove', 'wheelRelease', 'click']);
const isInt = (x: unknown): x is number => Number.isInteger(x);

export function parseHelperLine(line: string): HelperEvent | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  switch (o.type) {
    case 'ready':
      return isInt(o.version) ? { type: 'ready', version: o.version } : null;
    case 'cancel':
      return { type: 'cancel' };
    case 'toggled':
      return typeof o.enabled === 'boolean' ? { type: 'toggled', enabled: o.enabled } : null;
    case 'error':
      if (typeof o.message !== 'string') return null;
      return typeof o.code === 'string' ? { type: 'error', message: o.message, code: o.code } : { type: 'error', message: o.message };
    case 'sim':
      return typeof o.swallow === 'boolean' && typeof o.inject === 'string'
        ? { type: 'sim', swallow: o.swallow, inject: o.inject }
        : null;
    default:
      if (typeof o.type === 'string' && POINT_TYPES.has(o.type) && isInt(o.x) && isInt(o.y)) {
        // Anything but a known wheel (including no field, from a version 1 helper) is the ping wheel.
        const wheel = o.wheel === 'emote' || o.wheel === 'action' ? o.wheel : 'ping';
        return { type: o.type as PointType, x: o.x, y: o.y, wheel };
      }
      return null;
  }
}

export type HelperTrigger = 'alt' | 'ctrl' | 'shift' | 'win' | 'capslock' | 'mouse4' | 'mouse5' | 'vk';

/** Messages Electron writes to the helper's stdin. Flat objects only: the C++ parser has no nesting. */
export type HelperCommand =
  | {
      type: 'config';
      trigger: HelperTrigger;
      triggerVk: number;
      clickPing: boolean;
      /** 'off': no emote key, so no emote gestures. */
      emoteTrigger: HelperTrigger | 'off';
      emoteTriggerVk: number;
      emoteClick: boolean;
      /** 'off': no action key, so no action gestures. */
      actionTrigger: HelperTrigger | 'off';
      actionTriggerVk: number;
      dragThresholdPx: number;
      toggleMods: number;
      toggleVk: number;
      enabled: boolean;
    }
  | { type: 'setEnabled'; enabled: boolean }
  | { type: 'suspend'; on: boolean }
  | { type: 'injectKeys'; keys: number[] }
  | { type: 'shutdown' };

export function configCommand(s: Settings, enabled: boolean): HelperCommand {
  const t = s.trigger;
  const e = s.emoteTrigger;
  const a = s.actionTrigger;
  return {
    type: 'config',
    trigger: typeof t === 'object' ? 'vk' : t,
    triggerVk: typeof t === 'object' ? t.vk : 0,
    clickPing: s.clickPing,
    emoteTrigger: typeof e === 'object' ? 'vk' : e,
    emoteTriggerVk: typeof e === 'object' ? e.vk : 0,
    emoteClick: s.emoteClick,
    actionTrigger: typeof a === 'object' ? 'vk' : a,
    actionTriggerVk: typeof a === 'object' ? a.vk : 0,
    dragThresholdPx: s.dragThresholdPx,
    toggleMods: s.toggleHotkey.mods,
    toggleVk: s.toggleHotkey.vk,
    enabled,
  };
}

export function serializeCommand(c: HelperCommand): string {
  if (c.type === 'injectKeys') return `${JSON.stringify({ type: 'injectKeys', keys: c.keys.join(',') })}\n`;
  return `${JSON.stringify(c)}\n`;
}
