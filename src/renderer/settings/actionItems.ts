import {
  ACTION_TEMPLATES, actionSlotIconUrl, type ActionSlot,
} from '../../shared/actions';
import { actionDescription, actionDisplayName } from '../../shared/actionDisplay';
import type { Strings } from '../../shared/i18n';
import type { PoolItem } from './components/WheelEditor';

const displayName = (slot: ActionSlot, t: Strings): string =>
  actionDisplayName(slot, t);

export function actionLibraryItems(t: Strings): PoolItem<string>[] {
  return ACTION_TEMPLATES.map((slot) => ({
    id: `template:${slot.kind}`,
    icon: `../actions/${slot.icon}.svg`,
    name: t.actionNames[slot.kind],
    description: actionDescription(slot, t),
  }));
}

export function actionWheelItems(wheel: readonly ActionSlot[], t: Strings): PoolItem<string>[] {
  return wheel.map((slot) => ({
    id: slot.id,
    icon: actionSlotIconUrl(slot),
    name: displayName(slot, t),
    description: actionDescription(slot, t),
  }));
}
