import { describe, expect, it } from 'vitest';
import {
  ACTION_TEMPLATES, DEFAULT_ACTION_WHEEL, actionIconUrl, normalizeActionSlot, normalizeActionWheel,
} from '../../src/shared/actions';

describe('action model', () => {
  it('ships the default 8-slot action wheel', () => {
    expect(DEFAULT_ACTION_WHEEL.map((a) => a.kind)).toEqual([
      'screenshot', 'muteToggle', 'showDesktop', 'lockScreen',
      'openBrowser', 'openUrl', 'openApp', 'openFolder',
    ]);
    expect(new Set(DEFAULT_ACTION_WHEEL.map((a) => a.id)).size).toBe(8);
  });

  it('offers more action templates than the default wheel', () => {
    expect(ACTION_TEMPLATES.map((a) => a.kind)).toEqual([
      'screenshot', 'showDesktop', 'lockScreen', 'muteToggle', 'volumeUp', 'volumeDown',
      'openBrowser', 'openUrl', 'openApp', 'openFile', 'openFolder',
      'openDownloads', 'openDesktop', 'openHome',
    ]);
  });

  it('normalizes a parameterized URL action', () => {
    expect(normalizeActionSlot({
      id: 'site',
      kind: 'openUrl',
      label: 'Docs',
      icon: 'web',
      params: { url: 'https://example.com', path: 'C:/ignored' },
      extra: true,
    }, 2)).toEqual({
      id: 'site',
      kind: 'openUrl',
      label: 'Docs',
      icon: 'web',
      params: { url: 'https://example.com' },
    });
  });

  it('falls back invalid slots by position and repairs duplicate ids', () => {
    const wheel = normalizeActionWheel([
      { id: 'same', kind: 'screenshot', label: 'Shot', icon: 'screenshot' },
      { id: 'same', kind: 'openUrl', label: '', icon: 'web', params: { url: 7 } },
      { kind: 'missing' },
    ]);
    expect(wheel).toHaveLength(8);
    expect(new Set(wheel.map((a) => a.id)).size).toBe(8);
    expect(wheel[0]).toMatchObject({ kind: 'screenshot', label: 'Shot' });
    expect(wheel[1]).toMatchObject({ kind: 'openUrl', label: 'Open website', params: {} });
    expect(wheel[2]).toMatchObject(DEFAULT_ACTION_WHEEL[2]);
  });

  it('repairs duplicate ids without reusing an existing repaired id', () => {
    const wheel = normalizeActionWheel([
      { id: 'action-1-openUrl', kind: 'screenshot', label: 'Shot', icon: 'screenshot' },
      { id: 'action-1-openUrl', kind: 'openUrl', label: 'Docs', icon: 'web', params: { url: 'https://example.com' } },
    ]);
    expect(wheel[0].id).toBe('action-1-openUrl');
    expect(wheel[1].id).toBe('action-1-openUrl-1');
    expect(new Set(wheel.map((a) => a.id)).size).toBe(8);
  });

  it('builds overlay icon urls', () => {
    expect(actionIconUrl('screenshot')).toBe('../actions/screenshot.svg');
  });
});
