import {
  ACTION_TEMPLATES, actionTemplate, type ActionSlot,
} from '../../shared/actions';
import type { Strings } from '../../shared/i18n';
import type { PoolItem } from './components/WheelEditor';

const displayName = (slot: ActionSlot, t: Strings): string =>
  slot.label === actionTemplate(slot.kind).label ? t.actionNames[slot.kind] : slot.label;

export function actionLibraryItems(t: Strings): PoolItem<string>[] {
  return ACTION_TEMPLATES.map((slot) => ({
    id: `template:${slot.kind}`,
    icon: `../actions/${slot.icon}.svg`,
    name: t.actionNames[slot.kind],
  }));
}

export function actionWheelItems(wheel: readonly ActionSlot[], t: Strings): PoolItem<string>[] {
  return wheel.map((slot) => ({
    id: slot.id,
    icon: `../actions/${slot.icon}.svg`,
    name: displayName(slot, t),
  }));
}
