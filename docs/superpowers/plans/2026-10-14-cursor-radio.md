# Cursor Radio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two cursor switches with one Summoner cursor radio group: system cursor, new cursor, old cursor.

**Architecture:** Keep the existing settings fields and main-process cursor service. Add a small renderer helper that maps the existing booleans to a radio value and back, then render a single `SettingRow` with Fluent `RadioGroup`.

**Tech Stack:** Electron, React, TypeScript, Fluent UI, Vitest.

## Global Constraints

- Continue development in `.worktrees/develop` on branch `develop`.
- Keep the default cursor pack as the newer Summoner cursor.
- Selecting system cursor restores the user's original Windows cursor scheme.
- Preserve the existing `cursorSkinEnabled` and `cursorSkinClassic` settings fields.
- Update `AGENTS.md` when project decisions or habits change.

---

### Task 1: Cursor Scheme Mapping

**Files:**
- Create: `src/renderer/settings/cursorSkinScheme.ts`
- Test: `tests/renderer/cursorSkinScheme.test.ts`

**Interfaces:**
- Produces: `type CursorSkinScheme = 'system' | 'modern' | 'classic'`
- Produces: `cursorSkinSchemeFromSettings(settings: Pick<Settings, 'cursorSkinEnabled' | 'cursorSkinClassic'>): CursorSkinScheme`
- Produces: `cursorSkinPatchForScheme(scheme: CursorSkinScheme): Partial<Settings>`

- [x] **Step 1: Write the failing test**

```ts
expect(cursorSkinSchemeFromSettings({ cursorSkinEnabled: false, cursorSkinClassic: false })).toBe('system');
expect(cursorSkinSchemeFromSettings({ cursorSkinEnabled: true, cursorSkinClassic: false })).toBe('modern');
expect(cursorSkinSchemeFromSettings({ cursorSkinEnabled: true, cursorSkinClassic: true })).toBe('classic');
expect(cursorSkinPatchForScheme('modern')).toEqual({ cursorSkinEnabled: true, cursorSkinClassic: false });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/renderer/cursorSkinScheme.test.ts`

- [x] **Step 3: Write minimal implementation**

Create the helper with the exact signatures above.

- [x] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/renderer/cursorSkinScheme.test.ts`

### Task 2: Settings UI Radio Group

**Files:**
- Modify: `src/renderer/settings/App.tsx`
- Modify: `src/renderer/settings/settings.css`
- Modify: `src/shared/i18n.ts`
- Test: `tests/shared/i18n.test.ts`

**Interfaces:**
- Consumes: Task 1 helper functions.
- Produces: one settings row titled `t.cursorSkin` with radio labels `t.cursorSkinSystem`, `t.cursorSkinModern`, and `t.cursorSkinClassic`.

- [x] **Step 1: Write the failing text test**

```ts
expect(strings('en').cursorSkinSystem).toBe('System cursor');
expect(strings('zh-CN').cursorSkinSystem).toBe('系统指针');
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/shared/i18n.test.ts tests/renderer/cursorSkinScheme.test.ts`

- [x] **Step 3: Implement the UI**

Import `Radio` and `RadioGroup`, replace the two `SwitchRow` cursor controls with a `SettingRow`, and call `update(cursorSkinPatchForScheme(value))` from the radio change handler.

- [x] **Step 4: Style the radio group**

Add a compact `.cursorSkinChoices` rule so the three options read as one grouped choice inside the row.

- [x] **Step 5: Verify**

Run:
- `npm run test -- tests/shared/i18n.test.ts tests/renderer/cursorSkinScheme.test.ts tests/main/settingsIpc.test.ts`
- `npm run typecheck`
- `npm run dist`

## Self-Review

- Spec coverage: the plan covers title, radio labels, system restore, new/old selection, and the existing boolean settings shape.
- Placeholder scan: no placeholders remain.
- Type consistency: the radio values and helper return values use the same `CursorSkinScheme` union.
