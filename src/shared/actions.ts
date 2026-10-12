export type ActionKind =
  | 'screenshot' | 'showDesktop' | 'lockScreen' | 'muteToggle' | 'volumeUp' | 'volumeDown'
  | 'openBrowser' | 'openUrl' | 'openApp' | 'openFile' | 'openFolder';

export type ActionIcon =
  | 'screenshot' | 'desktop' | 'lock' | 'mute' | 'volume-up' | 'volume-down'
  | 'browser' | 'web' | 'app' | 'file' | 'folder';

export const VOLUME_STEP_MIN = 1;
export const VOLUME_STEP_MAX = 10;
export const DEFAULT_VOLUME_STEP = 1;

export interface ActionSlot {
  id: string;
  kind: ActionKind;
  label: string;
  icon: ActionIcon;
  params?: {
    url?: string;
    path?: string;
    volumeStep?: number;
  };
}

export const ACTION_TEMPLATES: readonly ActionSlot[] = [
  { id: 'tpl-screenshot', kind: 'screenshot', label: 'Screenshot', icon: 'screenshot' },
  { id: 'tpl-showDesktop', kind: 'showDesktop', label: 'Show desktop', icon: 'desktop' },
  { id: 'tpl-lockScreen', kind: 'lockScreen', label: 'Lock screen', icon: 'lock' },
  { id: 'tpl-muteToggle', kind: 'muteToggle', label: 'Mute/unmute', icon: 'mute' },
  { id: 'tpl-volumeUp', kind: 'volumeUp', label: 'Volume up', icon: 'volume-up', params: { volumeStep: DEFAULT_VOLUME_STEP } },
  { id: 'tpl-volumeDown', kind: 'volumeDown', label: 'Volume down', icon: 'volume-down', params: { volumeStep: DEFAULT_VOLUME_STEP } },
  { id: 'tpl-openBrowser', kind: 'openBrowser', label: 'Open browser', icon: 'browser' },
  { id: 'tpl-openUrl', kind: 'openUrl', label: 'Open website', icon: 'web', params: {} },
  { id: 'tpl-openApp', kind: 'openApp', label: 'Open app', icon: 'app', params: {} },
  { id: 'tpl-openFile', kind: 'openFile', label: 'Open file', icon: 'file', params: {} },
  { id: 'tpl-openFolder', kind: 'openFolder', label: 'Open folder', icon: 'folder', params: {} },
];

export const DEFAULT_ACTION_WHEEL: readonly ActionSlot[] = [
  { ...ACTION_TEMPLATES[0], id: 'action-0-screenshot' },
  { ...ACTION_TEMPLATES[3], id: 'action-1-muteToggle' },
  { ...ACTION_TEMPLATES[1], id: 'action-2-showDesktop' },
  { ...ACTION_TEMPLATES[2], id: 'action-3-lockScreen' },
  { ...ACTION_TEMPLATES[6], id: 'action-4-openBrowser' },
  { ...ACTION_TEMPLATES[7], id: 'action-5-openUrl' },
  { ...ACTION_TEMPLATES[8], id: 'action-6-openApp' },
  { ...ACTION_TEMPLATES[10], id: 'action-7-openFolder' },
];

const KINDS = new Set<ActionKind>(ACTION_TEMPLATES.map((a) => a.kind));
const ICONS = new Set<ActionIcon>(ACTION_TEMPLATES.map((a) => a.icon));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const copyActionSlot = (slot: ActionSlot): ActionSlot => ({
  ...slot,
  params: slot.params ? { ...slot.params } : undefined,
});

const cleanText = (v: unknown, fallback: string): string => {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s.length > 0 ? s.slice(0, 40) : fallback;
};

export const normalizeVolumeStep = (v: unknown): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : DEFAULT_VOLUME_STEP;
  return Math.min(VOLUME_STEP_MAX, Math.max(VOLUME_STEP_MIN, n));
};

export const isActionKind = (v: unknown): v is ActionKind => typeof v === 'string' && KINDS.has(v as ActionKind);

export const actionIconUrl = (icon: ActionIcon): string => `../actions/${icon}.svg`;

export const actionTemplate = (kind: ActionKind): ActionSlot => ACTION_TEMPLATES.find((a) => a.kind === kind) as ActionSlot;

export function normalizeActionSlot(raw: unknown, index: number): ActionSlot {
  const fallback = DEFAULT_ACTION_WHEEL[index] ?? DEFAULT_ACTION_WHEEL[0];
  if (!isObj(raw) || !isActionKind(raw.kind)) return copyActionSlot(fallback);
  const template = actionTemplate(raw.kind);
  const icon = typeof raw.icon === 'string' && ICONS.has(raw.icon as ActionIcon) ? (raw.icon as ActionIcon) : template.icon;
  const params = isObj(raw.params) ? raw.params : {};
  const slot: ActionSlot = {
    id: cleanText(raw.id, `action-${index}-${raw.kind}`),
    kind: raw.kind,
    label: cleanText(raw.label, template.label),
    icon,
  };
  if (raw.kind === 'openUrl') slot.params = typeof params.url === 'string' ? { url: params.url.trim() } : {};
  if (raw.kind === 'openApp' || raw.kind === 'openFile' || raw.kind === 'openFolder') {
    slot.params = typeof params.path === 'string' ? { path: params.path.trim() } : {};
  }
  if (raw.kind === 'volumeUp' || raw.kind === 'volumeDown') slot.params = { volumeStep: normalizeVolumeStep(params.volumeStep) };
  return slot;
}

export function normalizeActionWheel(raw: unknown): ActionSlot[] {
  const source = Array.isArray(raw) ? raw : DEFAULT_ACTION_WHEEL;
  const out = Array.from({ length: 8 }, (_, i) => normalizeActionSlot(source[i], i));
  const seen = new Set<string>();
  return out.map((slot, i) => {
    if (!seen.has(slot.id)) {
      seen.add(slot.id);
      return slot;
    }
    const base = `action-${i}-${slot.kind}`;
    let id = base;
    let n = 1;
    while (seen.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    const fixed = { ...slot, id };
    seen.add(fixed.id);
    return fixed;
  });
}
