import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTION_WHEEL, type ActionSlot } from '../../src/shared/actions';
import { strings } from '../../src/shared/i18n';
import {
  cloneActionTemplateForSlot,
  configurableActionKinds,
  isActionConfigurable,
  localizeActionConfigLabel,
  validateActionConfig,
} from '../../src/renderer/settings/actionConfig';

const slot = (kind: ActionSlot['kind'], params?: ActionSlot['params']): ActionSlot =>
  ({ id: `id-${kind}`, kind, label: kind, icon: 'app', params } as ActionSlot);

describe('action configuration helpers', () => {
  it('marks only parameterized actions as configurable', () => {
    expect(configurableActionKinds).toEqual(['volumeUp', 'volumeDown', 'openUrl', 'openApp', 'openFile', 'openFolder']);
    expect(isActionConfigurable('openUrl')).toBe(true);
    expect(isActionConfigurable('volumeDown')).toBe(true);
    expect(isActionConfigurable('showDesktop')).toBe(false);
    expect(isActionConfigurable('screenshot')).toBe(false);
  });

  it('requires valid modal values before parameterized actions can be placed', () => {
    expect(validateActionConfig(slot('openUrl'))).toBe('url');
    expect(validateActionConfig(slot('openUrl', { url: 'ftp://example.com' }))).toBe('url');
    expect(validateActionConfig(slot('openUrl', { url: 'https://example.com' }))).toBeNull();
    expect(validateActionConfig(slot('openApp', { path: '   ' }))).toBe('path');
    expect(validateActionConfig(slot('openFile', { path: 'C:\\Docs\\note.txt' }))).toBeNull();
    expect(validateActionConfig(slot('volumeUp', { volumeStep: 0 }))).toBe('volumeStep');
    expect(validateActionConfig(slot('volumeDown', { volumeStep: 3 }))).toBe('volumeStep');
    expect(validateActionConfig(slot('volumeDown', { volumeStep: 6 }))).toBeNull();
  });

  it('creates unique configured slots so the same template can be used more than once', () => {
    const first = cloneActionTemplateForSlot('openUrl', 1, { url: 'https://one.example' });
    const second = cloneActionTemplateForSlot('openUrl', 2, { url: 'https://two.example' });
    expect(first.id).not.toBe(second.id);
    expect(first.params).toEqual({ url: 'https://one.example' });
    expect(second.params).toEqual({ url: 'https://two.example' });
  });

  it('localizes default labels before showing configurable actions in the dialog', () => {
    const t = strings('zh-CN');
    const slots = [
      cloneActionTemplateForSlot('openUrl', 1, { url: 'https://example.com' }),
      cloneActionTemplateForSlot('openApp', 2, { path: 'C:\\Tools\\tool.exe' }),
      cloneActionTemplateForSlot('openFile', 3, { path: 'C:\\Docs\\note.txt' }),
      cloneActionTemplateForSlot('openFolder', 4, { path: 'C:\\Docs' }),
    ].map((s) => localizeActionConfigLabel(s, t));

    expect(slots.map((s) => s.label)).toEqual([
      t.actionNames.openUrl,
      t.actionNames.openApp,
      t.actionNames.openFile,
      t.actionNames.openFolder,
    ]);
  });

  it('keeps a user-written action label when opening the dialog', () => {
    const t = strings('zh-CN');
    const slot = { ...cloneActionTemplateForSlot('openUrl', 1, { url: 'https://example.com' }), label: 'Docs' };

    expect(localizeActionConfigLabel(slot, t).label).toBe('Docs');
  });

  it('keeps non-parameterized defaults available without configuration', () => {
    expect(validateActionConfig(DEFAULT_ACTION_WHEEL[0])).toBeNull();
  });
});
