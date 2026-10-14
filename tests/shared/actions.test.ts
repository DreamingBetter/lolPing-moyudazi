import { describe, expect, it } from 'vitest';
import {
  ACTION_TEMPLATES, DEFAULT_ACTION_WHEEL, actionIconUrl, actionSlotIconUrl, normalizeActionSlot, normalizeActionWheel,
} from '../../src/shared/actions';

describe('action model', () => {
  it('ships the default 8-slot action wheel', () => {
    expect(DEFAULT_ACTION_WHEEL.map((a) => a.kind)).toEqual([
      'screenshot', 'lockScreen', 'volumeUp', 'openBrowser',
      'muteToggle', 'openUrl', 'volumeDown', 'showDesktop',
    ]);
    expect(DEFAULT_ACTION_WHEEL[5].params).toEqual({ url: 'https://www.baidu.com' });
    expect(new Set(DEFAULT_ACTION_WHEEL.map((a) => a.id)).size).toBe(8);
  });

  it('offers more action templates than the default wheel', () => {
    expect(ACTION_TEMPLATES.map((a) => a.kind)).toEqual([
      'screenshot', 'showDesktop', 'lockScreen', 'muteToggle', 'volumeUp', 'volumeDown',
      'openBrowser', 'openUrl', 'openApp', 'openFile', 'openFolder',
    ]);
  });

  it('normalizes a parameterized URL action', () => {
    const iconUrl = 'data:image/png;base64,aWNvbg==';
    expect(normalizeActionSlot({
      id: 'site',
      kind: 'openUrl',
      label: 'Docs',
      icon: 'web',
      params: { url: 'https://example.com', path: 'C:/ignored', iconUrl },
      extra: true,
    }, 2)).toEqual({
      id: 'site',
      kind: 'openUrl',
      label: 'Docs',
      icon: 'web',
      params: { url: 'https://example.com', iconUrl },
    });
  });

  it('keeps safe generated icons only on website and app actions', () => {
    const iconUrl = 'data:image/png;base64,aWNvbg==';
    expect(normalizeActionSlot({
      id: 'app',
      kind: 'openApp',
      label: 'Tool',
      icon: 'app',
      params: { path: 'C:\\Tools\\tool.exe', iconUrl },
    }, 0).params).toEqual({ path: 'C:\\Tools\\tool.exe', iconUrl });
    expect(normalizeActionSlot({
      id: 'remote',
      kind: 'openApp',
      label: 'Tool',
      icon: 'app',
      params: { path: 'C:\\Tools\\tool.exe', iconUrl: 'https://example.com/icon.png' },
    }, 0).params).toEqual({ path: 'C:\\Tools\\tool.exe' });
    expect(normalizeActionSlot({
      id: 'folder',
      kind: 'openFolder',
      label: 'Folder',
      icon: 'folder',
      params: { path: 'C:\\Docs', iconUrl },
    }, 0).params).toEqual({ path: 'C:\\Docs' });
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

  it('normalizes volume actions to even volume deltas', () => {
    expect(normalizeActionSlot({
      id: 'louder',
      kind: 'volumeUp',
      label: 'More',
      icon: 'volume-up',
      params: { volumeStep: 6 },
    }, 0)).toEqual({
      id: 'louder',
      kind: 'volumeUp',
      label: 'More',
      icon: 'volume-up',
      params: { volumeStep: 6 },
    });
    expect(normalizeActionSlot({
      id: 'quiet',
      kind: 'volumeDown',
      label: 'Less',
      icon: 'volume-down',
      params: { volumeStep: 99 },
    }, 0).params).toEqual({ volumeStep: 20 });
    expect(normalizeActionSlot({
      id: 'odd',
      kind: 'volumeUp',
      label: 'Odd',
      icon: 'volume-up',
      params: { volumeStep: 3 },
    }, 0).params).toEqual({ volumeStep: 4 });
    expect(normalizeActionSlot({
      id: 'bad',
      kind: 'volumeUp',
      label: 'Bad',
      icon: 'volume-up',
      params: { volumeStep: 'x' },
    }, 0).params).toEqual({ volumeStep: 2 });
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

  it('migrates the previous default action wheel to the current default', () => {
    const legacy = [
      { id: 'action-0-screenshot', kind: 'screenshot', label: 'Screenshot', icon: 'screenshot' },
      { id: 'action-1-muteToggle', kind: 'muteToggle', label: 'Mute/unmute', icon: 'mute' },
      { id: 'action-2-showDesktop', kind: 'showDesktop', label: 'Show desktop', icon: 'desktop' },
      { id: 'action-3-lockScreen', kind: 'lockScreen', label: 'Lock screen', icon: 'lock' },
      { id: 'action-4-openBrowser', kind: 'openBrowser', label: 'Open browser', icon: 'browser' },
      { id: 'action-5-openUrl', kind: 'openUrl', label: 'Open website', icon: 'web', params: {} },
      { id: 'action-6-openApp', kind: 'openApp', label: 'Open app', icon: 'app', params: {} },
      { id: 'action-7-openFolder', kind: 'openFolder', label: 'Open folder', icon: 'folder', params: {} },
    ];

    expect(normalizeActionWheel(legacy)).toEqual(DEFAULT_ACTION_WHEEL);
  });

  it('builds overlay icon urls', () => {
    expect(actionIconUrl('screenshot')).toBe('../actions/screenshot.svg');
    expect(actionSlotIconUrl({
      id: 'site',
      kind: 'openUrl',
      label: 'Docs',
      icon: 'web',
      params: { url: 'https://example.com', iconUrl: 'data:image/png;base64,aWNvbg==' },
    })).toBe('data:image/png;base64,aWNvbg==');
  });
});
