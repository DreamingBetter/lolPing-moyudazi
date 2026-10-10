import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAction, type ActionExecutorDeps } from '../../src/main/actionExecutor';
import type { ActionSlot } from '../../src/shared/actions';

const slot = (kind: ActionSlot['kind'], params?: ActionSlot['params']): ActionSlot =>
  ({ id: `id-${kind}`, kind, label: kind, icon: 'app', params } as ActionSlot);

let deps: ActionExecutorDeps;
beforeEach(() => {
  deps = {
    platform: 'win',
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
    run: vi.fn(async () => undefined),
    writeClipboard: vi.fn(),
    injectKeys: vi.fn(),
    exists: vi.fn(() => true),
    now: () => new Date(2026, 9, 10, 8, 9, 0),
    paths: { home: 'C:\\Users\\me', desktop: 'C:\\Users\\me\\Desktop', downloads: 'C:\\Users\\me\\Downloads' },
  };
});

describe('executeAction', () => {
  it('opens http and https urls only', async () => {
    await expect(executeAction(slot('openUrl', { url: 'https://example.com' }), deps)).resolves.toEqual({ ok: true });
    expect(deps.openExternal).toHaveBeenCalledWith('https://example.com/');
    await expect(executeAction(slot('openUrl', { url: 'file:///C:/Windows/System32/calc.exe' }), deps))
      .resolves.toEqual({ ok: false, reason: 'invalidUrl' });
  });

  it('reports missing config for parameterized actions', async () => {
    await expect(executeAction(slot('openApp'), deps)).resolves.toEqual({ ok: false, reason: 'missingConfig' });
    await expect(executeAction(slot('openFolder', { path: '   ' }), deps)).resolves.toEqual({ ok: false, reason: 'missingConfig' });
  });

  it('opens existing app file and folder paths', async () => {
    await executeAction(slot('openApp', { path: 'C:\\Tools\\app.exe' }), deps);
    await executeAction(slot('openFile', { path: 'C:\\Docs\\note.txt' }), deps);
    await executeAction(slot('openFolder', { path: 'C:\\Docs' }), deps);
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Tools\\app.exe');
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Docs\\note.txt');
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Docs');
  });

  it('surfaces shell.openPath errors', async () => {
    deps.openPath = vi.fn(async () => 'Access denied');
    await expect(executeAction(slot('openFile', { path: 'C:\\secret.txt' }), deps))
      .resolves.toEqual({ ok: false, reason: 'openFailed', message: 'Access denied' });
  });

  it('injects Windows shortcut keys for desktop operations', async () => {
    await executeAction(slot('screenshot'), deps);
    await executeAction(slot('showDesktop'), deps);
    await executeAction(slot('muteToggle'), deps);
    await executeAction(slot('volumeUp'), deps);
    await executeAction(slot('volumeDown'), deps);
    expect(deps.injectKeys).toHaveBeenCalledWith([0x5b, 0x10, 0x53]);
    expect(deps.injectKeys).toHaveBeenCalledWith([0x5b, 0x44]);
    expect(deps.injectKeys).toHaveBeenCalledWith([0xad]);
    expect(deps.injectKeys).toHaveBeenCalledWith([0xaf]);
    expect(deps.injectKeys).toHaveBeenCalledWith([0xae]);
  });

  it('locks the workstation on Windows', async () => {
    await expect(executeAction(slot('lockScreen'), deps)).resolves.toEqual({ ok: true });
    expect(deps.run).toHaveBeenCalledWith('rundll32.exe', ['user32.dll,LockWorkStation']);
  });

  it('opens known user folders', async () => {
    await executeAction(slot('openDownloads'), deps);
    await executeAction(slot('openDesktop'), deps);
    await executeAction(slot('openHome'), deps);
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Users\\me\\Downloads');
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Users\\me\\Desktop');
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Users\\me');
  });

  it('copies date and time', async () => {
    await executeAction(slot('copyDate'), deps);
    await executeAction(slot('copyTime'), deps);
    expect(deps.writeClipboard).toHaveBeenCalledWith('2026-10-10');
    expect(deps.writeClipboard).toHaveBeenCalledWith('08:09');
  });

  it('returns unsupported for Windows-only actions on macOS', async () => {
    deps.platform = 'mac';
    await expect(executeAction(slot('screenshot'), deps)).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });
});
