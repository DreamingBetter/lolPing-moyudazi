import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CursorSkinService, DEFAULT_AERO_CURSOR_VALUES, SUMMONER_CLASSIC_CURSOR_FILES, SUMMONER_CURSOR_FILES, type CursorSkinDeps,
} from '../../src/main/cursorSkin';

const sourceDir = 'C:\\bundle\\cursors\\summoner';
const classicSourceDir = 'C:\\bundle\\cursors\\summoner-classic';
const installDir = 'C:\\Users\\Player\\AppData\\Roaming\\lolPing\\cursors\\summoner';
const classicInstallDir = 'C:\\Users\\Player\\AppData\\Roaming\\lolPing\\cursors\\summoner-classic';
const backupFile = 'C:\\Users\\Player\\AppData\\Roaming\\lolPing\\cursor-backup.json';

const currentValues = {
  Arrow: 'C:\\Windows\\cursors\\aero_arrow.cur',
  Help: 'C:\\Windows\\cursors\\aero_helpsel.cur',
  AppStarting: 'C:\\Windows\\cursors\\aero_working.ani',
  Wait: 'C:\\Windows\\cursors\\aero_busy.ani',
  Crosshair: '',
  IBeam: '',
  NWPen: 'C:\\Windows\\cursors\\aero_pen.cur',
  No: 'C:\\Windows\\cursors\\aero_unavail.cur',
  SizeNS: 'C:\\Windows\\cursors\\aero_ns.cur',
  SizeWE: 'C:\\Windows\\cursors\\aero_ew.cur',
  SizeNWSE: 'C:\\Windows\\cursors\\aero_nwse.cur',
  SizeNESW: 'C:\\Windows\\cursors\\aero_nesw.cur',
  SizeAll: 'C:\\Windows\\cursors\\aero_move.cur',
  UpArrow: 'C:\\Windows\\cursors\\aero_up.cur',
  Hand: 'C:\\Windows\\cursors\\aero_link.cur',
  Pin: '',
  Person: '',
};

let existing: Set<string>;
let files: Map<string, string>;
let deps: CursorSkinDeps;

const service = () => new CursorSkinService(deps);
const scripts = () => vi.mocked(deps.execFile).mock.calls.map(([, args]) => args[args.length - 1]);
const registryScript = () => scripts().find((s) => s.includes('Set-ItemProperty')) ?? '';

beforeEach(() => {
  existing = new Set([
    ...Object.values(SUMMONER_CURSOR_FILES).map((file) => join(sourceDir, file)),
    ...Object.values(SUMMONER_CLASSIC_CURSOR_FILES).filter(Boolean).map((file) => join(classicSourceDir, file)),
  ]);
  files = new Map();
  deps = {
    platform: 'win',
    sourceDir,
    classicSourceDir,
    installDir,
    classicInstallDir,
    backupFile,
    systemRoot: 'C:\\Windows',
    exists: vi.fn((path) => existing.has(path)),
    mkdir: vi.fn(async (path) => { existing.add(path); }),
    copyFile: vi.fn(async (from, to) => {
      if (!existing.has(from)) throw new Error(`missing ${from}`);
      existing.add(to);
    }),
    readFile: vi.fn(async (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`missing ${path}`);
      return text;
    }),
    writeFile: vi.fn(async (path, text) => {
      files.set(path, text);
      existing.add(path);
    }),
    removeFile: vi.fn(async (path) => {
      files.delete(path);
      existing.delete(path);
    }),
    execFile: vi.fn(async () => ({ stdout: JSON.stringify(currentValues) })),
  };
});

describe('CursorSkinService', () => {
  it('backs up current cursors, installs Summoner files, writes registry values, and reloads cursors', async () => {
    await expect(service().applySummoner()).resolves.toEqual({ ok: true });

    expect(deps.writeFile).toHaveBeenCalledWith(backupFile, expect.stringContaining('"Arrow"'));
    expect(deps.copyFile).toHaveBeenCalledWith(join(sourceDir, 'normal.cur'), join(installDir, 'normal.cur'));
    expect(deps.copyFile).toHaveBeenCalledWith(join(sourceDir, 'busy.ani'), join(installDir, 'busy.ani'));
    expect(registryScript()).toContain('HKCU:\\Control Panel\\Cursors');
    expect(registryScript()).toContain(join(installDir, 'normal.cur'));
    expect(registryScript()).toContain('SystemParametersInfo(0x0057, 0, [IntPtr]::Zero, 0x0002)');
    expect(registryScript()).not.toContain('SystemParametersInfo(0x0057, 0, [IntPtr]::Zero, 0x0003)');
  });

  it('installs and writes the classic Summoner cursor scheme when requested', async () => {
    await expect(service().applySummoner('classic')).resolves.toEqual({ ok: true });

    expect(deps.copyFile).toHaveBeenCalledWith(join(classicSourceDir, 'normal.cur'), join(classicInstallDir, 'normal.cur'));
    expect(deps.copyFile).toHaveBeenCalledWith(join(classicSourceDir, 'precision.cur'), join(classicInstallDir, 'precision.cur'));
    expect(registryScript()).toContain(join(classicInstallDir, 'normal.cur'));
    expect(registryScript()).toContain(join(classicInstallDir, 'precision.cur'));
    expect(registryScript()).not.toContain(join(classicInstallDir, 'loc.cur'));
    expect(registryScript()).not.toContain(join(classicInstallDir, 'person.cur'));
  });

  it('does not overwrite an existing original cursor backup when applying again', async () => {
    existing.add(backupFile);
    files.set(backupFile, JSON.stringify({ version: 1, values: currentValues }));

    await expect(service().applySummoner()).resolves.toEqual({ ok: true });

    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(registryScript()).toContain(join(installDir, 'normal.cur'));
  });

  it('restores the backed up cursor scheme and removes the backup', async () => {
    existing.add(backupFile);
    files.set(backupFile, JSON.stringify({ version: 1, values: currentValues }));

    await expect(service().restoreOriginal()).resolves.toEqual({ ok: true });

    expect(registryScript()).toContain(currentValues.Arrow);
    expect(registryScript()).toContain(currentValues.Hand);
    expect(deps.removeFile).toHaveBeenCalledWith(backupFile);
  });

  it('falls back to the Windows Aero cursor scheme when the backup is missing', async () => {
    await expect(service().restoreOriginal()).resolves.toEqual({ ok: true });

    expect(registryScript()).toContain(DEFAULT_AERO_CURSOR_VALUES.Arrow);
    expect(registryScript()).toContain(DEFAULT_AERO_CURSOR_VALUES.Hand);
    expect(deps.removeFile).not.toHaveBeenCalled();
  });

  it('returns unsupported without touching files or PowerShell on macOS', async () => {
    deps.platform = 'mac';

    const result = await service().applySummoner();

    expect(result).toMatchObject({ ok: false });
    expect(deps.execFile).not.toHaveBeenCalled();
    expect(deps.copyFile).not.toHaveBeenCalled();
  });

  it('fails before writing the registry when a bundled cursor file is missing', async () => {
    existing.delete(join(sourceDir, 'normal.cur'));

    const result = await service().applySummoner();

    expect(result).toMatchObject({ ok: false });
    expect(String(result.ok ? '' : result.error)).toContain('normal.cur');
    expect(scripts().some((script) => script.includes('Set-ItemProperty'))).toBe(false);
  });

  it('rolls back to the backup when applying fails after registry writes begin', async () => {
    let registryWrites = 0;
    vi.mocked(deps.execFile).mockImplementation(async (_command, args) => {
      const script = args[args.length - 1];
      if (!script.includes('Set-ItemProperty')) return { stdout: JSON.stringify(currentValues) };
      registryWrites += 1;
      if (registryWrites === 1) throw new Error('refresh failed');
      return { stdout: '' };
    });

    const result = await service().applySummoner();

    const writeScripts = scripts().filter((script) => script.includes('Set-ItemProperty'));
    expect(result).toMatchObject({ ok: false });
    expect(writeScripts).toHaveLength(2);
    expect(writeScripts[1]).toContain(currentValues.Arrow);
    expect(deps.removeFile).not.toHaveBeenCalled();
    expect(files.has(backupFile)).toBe(true);
  });
});
