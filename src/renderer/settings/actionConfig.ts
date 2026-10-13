import {
  actionTemplate,
  normalizeVolumeStep,
  type ActionKind,
  type ActionSlot,
} from '../../shared/actions';

export type ActionConfigIssue = 'url' | 'path' | 'volumeStep';

export const configurableActionKinds = [
  'volumeUp',
  'volumeDown',
  'openUrl',
  'openApp',
  'openFile',
  'openFolder',
] as const satisfies readonly ActionKind[];

const CONFIGURABLE = new Set<ActionKind>(configurableActionKinds);

export const isActionConfigurable = (kind: ActionKind): boolean => CONFIGURABLE.has(kind);

const isWebUrl = (raw: string): boolean => {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

export function actionParams(kind: ActionKind, params: ActionSlot['params'] = {}): ActionSlot['params'] | undefined {
  if (kind === 'openUrl') return { url: params.url?.trim() ?? '' };
  if (kind === 'openApp' || kind === 'openFile' || kind === 'openFolder') return { path: params.path?.trim() ?? '' };
  if (kind === 'volumeUp' || kind === 'volumeDown') return { volumeStep: normalizeVolumeStep(params.volumeStep) };
  return undefined;
}

export function validateActionConfig(slot: ActionSlot): ActionConfigIssue | null {
  if (slot.kind === 'openUrl') {
    const url = slot.params?.url?.trim() ?? '';
    return isWebUrl(url) ? null : 'url';
  }
  if (slot.kind === 'openApp' || slot.kind === 'openFile' || slot.kind === 'openFolder') {
    return slot.params?.path?.trim() ? null : 'path';
  }
  if (slot.kind === 'volumeUp' || slot.kind === 'volumeDown') {
    return normalizeVolumeStep(slot.params?.volumeStep) === slot.params?.volumeStep ? null : 'volumeStep';
  }
  return null;
}

let slotSeed = 0;

export function cloneActionTemplateForSlot(kind: ActionKind, index: number, params?: ActionSlot['params']): ActionSlot {
  slotSeed += 1;
  const template = actionTemplate(kind);
  return {
    ...template,
    id: `action-${index}-${kind}-${Date.now().toString(36)}-${slotSeed}`,
    params: actionParams(kind, params ?? template.params),
  };
}

export function withActionConfig(slot: ActionSlot, patch: { label?: string; params?: ActionSlot['params'] }): ActionSlot {
  return {
    ...slot,
    label: patch.label?.trim() || slot.label,
    params: actionParams(slot.kind, patch.params ?? slot.params),
  };
}
