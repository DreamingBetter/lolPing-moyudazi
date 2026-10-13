# Summoner Cursor Skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Windows-only settings switch that applies the bundled Summoner `.cur/.ani` system cursor scheme when on and restores the user's previous cursor scheme when off.

**Architecture:** Store the desired switch in `Settings`, but execute the system cursor side effect in the main process. A focused `cursorSkin` service owns cursor-role mappings, backup serialization, per-user registry writes, and cursor reload commands; the settings IPC handler only persists the setting after the side effect succeeds.

**Tech Stack:** Electron, TypeScript, React/Fluent UI, Vitest, Windows PowerShell/registry commands, bundled `.cur` and `.ani` assets under `assets/cursors/summoner`.

## Global Constraints

- Do not support user-imported custom cursor packs.
- Only expose one built-in Summoner cursor pack from the user-provided assets.
- The settings UI is a single switch: on applies Summoner, off restores the user's original Windows cursor scheme.
- Windows cursor changes are global to the current Windows user; back up the previous cursor values before applying Summoner.
- If applying or restoring fails, return an IPC error and do not persist a misleading switch state.
- Keep macOS unsupported and hidden from the UI.
- After implementation, run `npm run typecheck`, `npm run test`, `npm run test:helper`, `git diff --check`, and `npm run dist`.

---

## File Structure

- `src/shared/settings.ts`: add `cursorSkinEnabled: boolean` default and normalization.
- `src/shared/i18n.ts`: add switch labels, descriptions, and error text.
- `src/main/cursorSkin.ts`: new Windows cursor scheme service.
- `src/main/settingsIpc.ts`: gate cursor switch updates through the service before persisting settings.
- `src/main/index.ts`: create the cursor service and pass it to settings IPC.
- `src/renderer/settings/App.tsx`: render the switch in the App section on Windows.
- `tests/shared/settings.test.ts`: cover setting default and normalization.
- `tests/main/cursorSkin.test.ts`: cover mapping, backup, command behavior, and unsupported platform behavior.
- `tests/main/settingsIpc.test.ts`: cover successful apply/restore and failed side effect behavior.
- `package.json`: ensure bundled cursor assets are packaged if Vite public assets alone are insufficient.
- `AGENTS.md`: keep cursor-skin decisions current.

### Task 1: Setting and UI Contract

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/i18n.ts`
- Modify: `src/renderer/settings/App.tsx`
- Test: `tests/shared/settings.test.ts`

**Interfaces:**
- Produces: `Settings.cursorSkinEnabled: boolean`
- Produces: `Strings.cursorSkin`, `Strings.cursorSkinDesc`, `Strings.cursorSkinFailed`

- [ ] **Step 1: Write failing settings tests**

Add tests asserting:

```ts
expect(normalizeSettings(undefined).cursorSkinEnabled).toBe(false);
expect(normalizeSettings({ cursorSkinEnabled: true }).cursorSkinEnabled).toBe(true);
expect(normalizeSettings({ cursorSkinEnabled: 'yes' }).cursorSkinEnabled).toBe(false);
```

- [ ] **Step 2: Run the target test and verify it fails**

Run: `npm run test -- tests/shared/settings.test.ts`

Expected: FAIL because `cursorSkinEnabled` is missing.

- [ ] **Step 3: Implement the setting**

Add `cursorSkinEnabled` to `Settings`, `DEFAULT_SETTINGS`, `BoolKey`, and `normalizeSettings`.

- [ ] **Step 4: Add localized UI strings and switch**

Add i18n fields and render a Windows-only `SwitchRow` in the App section:

```tsx
{!MAC ? (
  <SwitchRow icon={<Cursor24Regular />} title={t.cursorSkin} description={t.cursorSkinDesc}
    checked={s.cursorSkinEnabled} onChange={(v) => void update({ cursorSkinEnabled: v })} />
) : null}
```

- [ ] **Step 5: Run the target test and verify it passes**

Run: `npm run test -- tests/shared/settings.test.ts`

Expected: PASS.

### Task 2: Cursor Skin Service

**Files:**
- Create: `src/main/cursorSkin.ts`
- Test: `tests/main/cursorSkin.test.ts`

**Interfaces:**
- Produces: `type CursorSkinResult = { ok: true } | { ok: false; error: string }`
- Produces: `interface CursorSkinDeps { platform: Platform; sourceDir: string; installDir: string; backupFile: string; run(command: string, args: string[]): Promise<void>; readJson(path: string): unknown | null; writeJson(path: string, value: unknown): Promise<void>; copyFile(from: string, to: string): Promise<void>; mkdir(path: string): Promise<void>; exists(path: string): boolean; }`
- Produces: `class CursorSkinService { applySummoner(): Promise<CursorSkinResult>; restoreOriginal(): Promise<CursorSkinResult>; }`

- [ ] **Step 1: Write failing cursor service tests**

Cover:

```ts
await service.applySummoner();
expect(deps.writeJson).toHaveBeenCalledWith(backupFile, expect.objectContaining({ Arrow: expect.any(String) }));
expect(deps.copyFile).toHaveBeenCalledWith(sourceNormal, installedNormal);
expect(deps.run).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining([expect.stringContaining('Control Panel\\Cursors')]));
```

Also cover restore using an existing backup, unsupported mac platform, and missing source asset failure.

- [ ] **Step 2: Run the target test and verify it fails**

Run: `npm run test -- tests/main/cursorSkin.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal service**

Implement:

- Role mapping from Windows cursor registry names to Summoner files:
  - `Arrow -> normal.cur`
  - `Help -> help.cur`
  - `AppStarting -> working.ani`
  - `Wait -> busy.ani`
  - `Crosshair -> crosshair.cur`
  - `IBeam -> text.cur`
  - `NWPen -> handwriting.cur`
  - `No -> unavailable.cur`
  - `SizeNS -> vert.cur`
  - `SizeWE -> horiz.cur`
  - `SizeNWSE -> diag1.cur`
  - `SizeNESW -> diag2.cur`
  - `SizeAll -> move.cur`
  - `UpArrow -> alt.cur`
  - `Hand -> link.cur`
  - `Pin -> loc.cur`
  - `Person -> person.cur`
- Backup current `HKCU:\Control Panel\Cursors` values before first apply.
- Copy bundled files to `installDir` before applying so registry paths are stable.
- Write registry values and run `SystemParametersInfo(SPI_SETCURSORS)` through PowerShell.
- Restore from backup on off.

- [ ] **Step 4: Run the target test and verify it passes**

Run: `npm run test -- tests/main/cursorSkin.test.ts`

Expected: PASS.

### Task 3: IPC Side Effect Gate

**Files:**
- Modify: `src/main/settingsIpc.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/settingsIpc.test.ts`

**Interfaces:**
- Consumes: `CursorSkinService.applySummoner()`, `CursorSkinService.restoreOriginal()`
- Produces: optional `cursorSkin` dependency in `SettingsIpcDeps`

- [ ] **Step 1: Write failing IPC tests**

Add tests asserting:

```ts
const cursorSkin = { applySummoner: vi.fn(async () => ({ ok: true as const })), restoreOriginal: vi.fn(async () => ({ ok: true as const })) };
registerWith(undefined, cursorSkin);
await call(SETTINGS_CH.set, { cursorSkinEnabled: true });
expect(cursorSkin.applySummoner).toHaveBeenCalledTimes(1);
expect(store.get().cursorSkinEnabled).toBe(true);
```

Add failure case:

```ts
cursorSkin.applySummoner.mockResolvedValueOnce({ ok: false, error: 'boom' });
const result = await call(SETTINGS_CH.set, { cursorSkinEnabled: true });
expect(result).toMatchObject({ ok: false, error: 'boom', settings: { cursorSkinEnabled: false } });
expect(store.get().cursorSkinEnabled).toBe(false);
```

- [ ] **Step 2: Run the target test and verify it fails**

Run: `npm run test -- tests/main/settingsIpc.test.ts`

Expected: FAIL because `SettingsIpcDeps` has no cursor service handling.

- [ ] **Step 3: Implement IPC gating**

Make the `settings:set` handler async. If the incoming patch explicitly changes `cursorSkinEnabled`, call the service first. Only call `store.update(patch)` after the service returns ok. If service is absent or platform unsupported, return a localized failure and current settings.

- [ ] **Step 4: Wire service in `index.ts`**

Create `CursorSkinService` with:

- `sourceDir: assetPath('cursors', 'summoner')`
- `installDir: join(settingsDir(), 'cursors', 'summoner')`
- `backupFile: join(settingsDir(), 'cursor-backup.json')`

- [ ] **Step 5: Run the target test and verify it passes**

Run: `npm run test -- tests/main/settingsIpc.test.ts`

Expected: PASS.

### Task 4: Packaging and Verification

**Files:**
- Modify: `package.json` only if the built cursor assets are not present under `out/renderer/cursors` after build.
- Modify: `AGENTS.md` if implementation details changed.

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 2: Run all renderer/main tests**

Run: `npm run test`

Expected: exit 0.

- [ ] **Step 3: Run helper tests**

Run: `npm run test:helper`

Expected: exit 0.

- [ ] **Step 4: Run package build**

Run: `npm run dist`

Expected: exit 0 and refreshed `release/lolPing-Setup-0.5.0.exe` plus `release/win-unpacked/lolPing.exe`.

- [ ] **Step 5: Verify cursor assets in packaged output**

Check that Summoner cursor assets are present under the packaged app resources.

- [ ] **Step 6: Check diff whitespace**

Run: `git diff --check`

Expected: no whitespace errors. Existing LF/CRLF warnings may appear.

## Self-Review

- Spec coverage: covers single switch, bundled-only assets, backup, restore, Windows-only scope, packaging, and verification.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: `cursorSkinEnabled`, `CursorSkinService`, and `CursorSkinResult` names are consistent across tasks.
