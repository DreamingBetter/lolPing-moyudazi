import { execFile as nodeExecFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { Platform } from '../shared/platform';

export type CursorSkinResult = { ok: true } | { ok: false; error: string };

export const CURSOR_ROLES = [
  'Arrow',
  'Help',
  'AppStarting',
  'Wait',
  'Crosshair',
  'IBeam',
  'NWPen',
  'No',
  'SizeNS',
  'SizeWE',
  'SizeNWSE',
  'SizeNESW',
  'SizeAll',
  'UpArrow',
  'Hand',
  'Pin',
  'Person',
] as const;

export type CursorRole = typeof CURSOR_ROLES[number];
export type CursorValues = Record<CursorRole, string>;

export const SUMMONER_CURSOR_FILES: Record<CursorRole, string> = {
  Arrow: 'normal.cur',
  Help: 'help.cur',
  AppStarting: 'working.ani',
  Wait: 'busy.ani',
  Crosshair: 'crosshair.cur',
  IBeam: 'text.cur',
  NWPen: 'handwriting.cur',
  No: 'unavailable.cur',
  SizeNS: 'vert.cur',
  SizeWE: 'horiz.cur',
  SizeNWSE: 'diag1.cur',
  SizeNESW: 'diag2.cur',
  SizeAll: 'move.cur',
  UpArrow: 'alt.cur',
  Hand: 'link.cur',
  Pin: 'loc.cur',
  Person: 'person.cur',
};

const aero = (file: string, systemRoot: string): string => join(systemRoot, 'cursors', file);

export function defaultAeroCursorValues(systemRoot = 'C:\\Windows'): CursorValues {
  return {
    Arrow: aero('aero_arrow.cur', systemRoot),
    Help: aero('aero_helpsel.cur', systemRoot),
    AppStarting: aero('aero_working.ani', systemRoot),
    Wait: aero('aero_busy.ani', systemRoot),
    Crosshair: '',
    IBeam: '',
    NWPen: aero('aero_pen.cur', systemRoot),
    No: aero('aero_unavail.cur', systemRoot),
    SizeNS: aero('aero_ns.cur', systemRoot),
    SizeWE: aero('aero_ew.cur', systemRoot),
    SizeNWSE: aero('aero_nwse.cur', systemRoot),
    SizeNESW: aero('aero_nesw.cur', systemRoot),
    SizeAll: aero('aero_move.cur', systemRoot),
    UpArrow: aero('aero_up.cur', systemRoot),
    Hand: aero('aero_link.cur', systemRoot),
    Pin: '',
    Person: '',
  };
}

export const DEFAULT_AERO_CURSOR_VALUES = defaultAeroCursorValues();

export interface CursorSkinDeps {
  platform: Platform;
  sourceDir: string;
  installDir: string;
  backupFile: string;
  systemRoot?: string;
  exists(path: string): boolean;
  mkdir(path: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  execFile(command: string, args: string[]): Promise<{ stdout: string }>;
}

export interface CursorSkinPaths {
  platform: Platform;
  sourceDir: string;
  installDir: string;
  backupFile: string;
}

const execFileAsync = promisify(nodeExecFile);

export function createCursorSkinService(paths: CursorSkinPaths): CursorSkinService {
  return new CursorSkinService({
    ...paths,
    systemRoot: process.env.SystemRoot || 'C:\\Windows',
    exists: existsSync,
    mkdir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    copyFile,
    readFile: (path) => readFile(path, 'utf8'),
    writeFile: (path, text) => writeFile(path, text, 'utf8'),
    removeFile: (path) => rm(path, { force: true }).then(() => undefined),
    execFile: async (command, args) => {
      const { stdout } = await execFileAsync(command, args, { windowsHide: true, encoding: 'utf8' });
      return { stdout: String(stdout) };
    },
  });
}

function err(e: unknown): CursorSkinResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeCursorValues(raw: unknown): CursorValues {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Cursor values are not an object.');
  const obj = raw as Record<string, unknown>;
  const out = {} as CursorValues;
  for (const role of CURSOR_ROLES) out[role] = typeof obj[role] === 'string' ? obj[role] : '';
  return out;
}

function backupValues(raw: unknown): CursorValues {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Cursor backup is not an object.');
  const obj = raw as { version?: unknown; values?: unknown };
  if (obj.version !== 1) throw new Error('Cursor backup version is not supported.');
  return normalizeCursorValues(obj.values);
}

export class CursorSkinService {
  constructor(private readonly deps: CursorSkinDeps) {}

  async applySummoner(): Promise<CursorSkinResult> {
    if (this.deps.platform !== 'win') return { ok: false, error: 'Cursor skins are only supported on Windows.' };
    try {
      this.verifySourceFiles();
      await this.backupCurrentValuesOnce();
      const values = await this.installSummonerValues();
      await this.writeAndReload(values);
      return { ok: true };
    } catch (e) {
      await this.rollbackApply().catch(() => undefined);
      return err(e);
    }
  }

  async restoreOriginal(): Promise<CursorSkinResult> {
    if (this.deps.platform !== 'win') return { ok: false, error: 'Cursor skins are only supported on Windows.' };
    try {
      const backup = await this.readBackup();
      const values = backup ?? defaultAeroCursorValues(this.deps.systemRoot);
      await this.writeAndReload(values);
      if (backup) await this.deps.removeFile(this.deps.backupFile).catch(() => undefined);
      return { ok: true };
    } catch (e) {
      return err(e);
    }
  }

  private verifySourceFiles(): void {
    for (const file of new Set(Object.values(SUMMONER_CURSOR_FILES))) {
      const path = join(this.deps.sourceDir, file);
      if (!this.deps.exists(path)) throw new Error(`Missing cursor asset: ${file}`);
    }
  }

  private async backupCurrentValuesOnce(): Promise<void> {
    if (this.deps.exists(this.deps.backupFile)) return;
    await this.deps.mkdir(dirname(this.deps.backupFile));
    const values = await this.readCurrentValues();
    await this.deps.writeFile(this.deps.backupFile, JSON.stringify({ version: 1, values }, null, 2));
  }

  private async readCurrentValues(): Promise<CursorValues> {
    const names = CURSOR_ROLES.map(psString).join(', ');
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$path = 'HKCU:\\Control Panel\\Cursors'",
      `$names = @(${names})`,
      '$values = [ordered]@{}',
      'foreach ($name in $names) {',
      '  $value = (Get-ItemProperty -Path $path -Name $name -ErrorAction SilentlyContinue).$name',
      "  if ($null -eq $value) { $value = '' }",
      '  $values[$name] = [string]$value',
      '}',
      '$values | ConvertTo-Json -Compress',
    ].join('\n');
    const { stdout } = await this.powerShell(script);
    return normalizeCursorValues(JSON.parse(stdout.trim() || '{}'));
  }

  private async installSummonerValues(): Promise<CursorValues> {
    await this.deps.mkdir(this.deps.installDir);
    for (const file of new Set(Object.values(SUMMONER_CURSOR_FILES))) {
      await this.deps.copyFile(join(this.deps.sourceDir, file), join(this.deps.installDir, file));
    }
    const out = {} as CursorValues;
    for (const role of CURSOR_ROLES) out[role] = join(this.deps.installDir, SUMMONER_CURSOR_FILES[role]);
    return out;
  }

  private async readBackup(): Promise<CursorValues | null> {
    if (!this.deps.exists(this.deps.backupFile)) return null;
    return backupValues(JSON.parse(await this.deps.readFile(this.deps.backupFile)));
  }

  private async rollbackApply(): Promise<void> {
    const backup = await this.readBackup();
    if (backup) await this.writeAndReload(backup);
  }

  private async writeAndReload(values: CursorValues): Promise<void> {
    const writes = CURSOR_ROLES.map((role) =>
      `Set-ItemProperty -Path $path -Name ${psString(role)} -Value ${psString(values[role])}`);
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$path = 'HKCU:\\Control Panel\\Cursors'",
      ...writes,
      "Add-Type @'",
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class LolPingCursorRefresh {',
      '  [DllImport("user32.dll", SetLastError = true)]',
      '  public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);',
      '}',
      "'@",
      '$ok = [LolPingCursorRefresh]::SystemParametersInfo(0x0057, 0, [IntPtr]::Zero, 0x0002)',
      "if (-not $ok) { throw 'SystemParametersInfo(SPI_SETCURSORS) failed.' }",
    ].join('\n');
    await this.powerShell(script);
  }

  private powerShell(script: string): Promise<{ stdout: string }> {
    return this.deps.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  }
}
