import {
  actionTemplate,
  normalizeVolumeStep,
  type ActionSlot,
} from './actions';
import type { Strings } from './i18n';

export function actionDisplayName(slot: ActionSlot, t: Strings): string {
  if (slot.kind === 'volumeUp' || slot.kind === 'volumeDown') {
    const sign = slot.kind === 'volumeUp' ? '+' : '-';
    return t.actionVolumeLabel(sign, normalizeVolumeStep(slot.params?.volumeStep));
  }
  return slot.label === actionTemplate(slot.kind).label ? t.actionNames[slot.kind] : slot.label;
}

export function actionDescription(slot: ActionSlot, t: Strings): string {
  return t.actionDescriptions[slot.kind];
}
