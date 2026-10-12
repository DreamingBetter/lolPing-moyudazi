import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTION_WHEEL, type ActionSlot } from '../../src/shared/actions';
import { strings } from '../../src/shared/i18n';
import { actionLibraryItems, actionWheelItems } from '../../src/renderer/settings/actionItems';

describe('action editor items', () => {
  it('keeps the built-in library unique while exposing wheel slots separately', () => {
    const t = strings('en');
    const library = actionLibraryItems(t);
    const wheel = actionWheelItems(DEFAULT_ACTION_WHEEL, t);

    expect(library).toHaveLength(14);
    expect(new Set(library.map((item) => item.id)).size).toBe(library.length);
    expect(library.every((item) => item.id.startsWith('template:'))).toBe(true);
    expect(wheel).toHaveLength(8);
    expect(wheel.map((item) => item.id)).toEqual(DEFAULT_ACTION_WHEEL.map((slot) => slot.id));
  });

  it('localizes built-in labels but preserves a custom slot label', () => {
    const custom: ActionSlot = { ...DEFAULT_ACTION_WHEEL[0], id: 'custom-shot', label: 'Work capture' };
    const t = strings('zh-CN');
    const [builtIn, customItem] = actionWheelItems([DEFAULT_ACTION_WHEEL[0], custom], t);

    expect(builtIn.name).toBe(t.actionNames.screenshot);
    expect(customItem.name).toBe('Work capture');
  });
});
