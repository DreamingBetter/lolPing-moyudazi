import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BROWSER_URL, executeAction, type ActionExecutorDeps } from '../../src/main/actionExecutor';
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
    injectKeys: vi.fn(),
    exists: vi.fn(() => true),
  };
});

describe('executeAction', () => {
  it('opens http and https urls only', async () => {
    await expect(executeAction(slot('openUrl', { url: 'https://example.com' }), deps)).resolves.toEqual({ ok: true });
    expect(deps.openExternal).toHaveBeenCalledWith('https://example.com/');
    await expect(executeAction(slot('openUrl', { url: 'file:///C:/Windows/System32/calc.exe' }), deps))
      .resolves.toEqual({ ok: false, reason: 'invalidUrl' });
  });

  it('opens the default browser with a web URL the OS can route', async () => {
    await expect(executeAction(slot('openBrowser'), deps)).resolves.toEqual({ ok: true });
    expect(DEFAULT_BROWSER_URL).toMatch(/^https:\/\//);
    expect(deps.openExternal).toHaveBeenCalledWith(DEFAULT_BROWSER_URL);
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

  it('uses Windows shell for show desktop and injects shortcut keys for other desktop operations', async () => {
    await executeAction(slot('screenshot'), deps);
    await executeAction(slot('showDesktop'), deps);
    await executeAction(slot('muteToggle'), deps);
    expect(deps.injectKeys).toHaveBeenCalledWith([0x5b, 0x10, 0x53]);
    expect(deps.run).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['(New-Object -ComObject Shell.Application).ToggleDesktop()']));
    expect(deps.injectKeys).toHaveBeenCalledWith([0xad]);
  });

  it('repeats volume media keys according to the configured step', async () => {
    await executeAction(slot('volumeUp', { volumeStep: 3 }), deps);
    await executeAction(slot('volumeDown', { volumeStep: 2 }), deps);
    const keys = vi.mocked(deps.injectKeys).mock.calls.map(([call]) => call[0]);
    expect(keys.filter((key) => key === 0xaf)).toHaveLength(3);
    expect(keys.filter((key) => key === 0xae)).toHaveLength(2);
  });

  it('locks the workstation on Windows', async () => {
    await expect(executeAction(slot('lockScreen'), deps)).resolves.toEqual({ ok: true });
    expect(deps.run).toHaveBeenCalledWith('rundll32.exe', ['user32.dll,LockWorkStation']);
  });

  it('returns unsupported for Windows-only actions on macOS', async () => {
    deps.platform = 'mac';
    await expect(executeAction(slot('screenshot'), deps)).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });
});
