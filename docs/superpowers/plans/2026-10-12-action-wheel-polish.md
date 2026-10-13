# Action Wheel Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the action wheel easier to use by defaulting to Shift, removing low-value date/time actions, eliminating duplicate library entries, and adding localized hover descriptions.

**Architecture:** Keep the shared action model as the source of valid action kinds and templates. Keep the wheel editor generic, but allow it to resolve wheel-slot metadata separately from the draggable library so action slots can remain visible without being duplicated as library tiles. Localized names and descriptions stay in the existing i18n tables.

**Tech Stack:** Electron, TypeScript, React, Fluent UI, Vitest, native C++ input helper.

## Global Constraints

- Preserve the existing ping wheel and emote wheel behavior.
- Preserve user-selected trigger keys when loading settings; only the default/fallback action key changes from Win to Shift.
- Keep the action wheel Windows-first and keep action execution in the main process.
- Do not remove the ability to place the same action kind in multiple wheel slots.
- Use `npm run dev` for iteration and `npm run dist` only for installable-build verification.

---

### Task 1: Trim the action model and change the default trigger

**Files:**
- Modify: `src/shared/actions.ts`
- Modify: `src/shared/settings.ts`
- Modify: `src/main/actionExecutor.ts`
- Modify: `tests/shared/actions.test.ts`
- Modify: `tests/shared/settings.test.ts`
- Modify: `tests/main/actionExecutor.test.ts`

**Interfaces:**
- `ActionKind` and `ActionIcon` no longer include date/time clipboard actions.
- `DEFAULT_SETTINGS.actionTrigger` and invalid action-trigger fallback become `'shift'`.

- [ ] **Step 1: Update tests first**

Change the action template expectation to the remaining 14 kinds, assert that the two removed kinds are absent, and change the settings default expectation to `shift`. Remove executor test cases that target date/time actions.

- [ ] **Step 2: Run focused tests and verify the expected failures**

Run:

```powershell
npx vitest run tests/shared/actions.test.ts tests/shared/settings.test.ts tests/main/actionExecutor.test.ts
```

Expected: failures identify the old template list, old action-trigger fallback, and removed executor behavior.

- [ ] **Step 3: Implement the smallest model/runtime change**

Remove `copyDate`, `copyTime`, `calendar`, and `clock` from the shared model and templates. Remove date/time formatting and executor cases. Change the action-key fallback and default to `shift`.

- [ ] **Step 4: Run the focused tests again**

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/actions.ts src/shared/settings.ts src/main/actionExecutor.ts tests/shared/actions.test.ts tests/shared/settings.test.ts tests/main/actionExecutor.test.ts
git commit -m "fix: simplify action wheel defaults"
```

### Task 2: Separate action library entries from wheel-slot metadata

**Files:**
- Modify: `src/renderer/settings/components/WheelEditor.tsx`
- Modify: `src/renderer/settings/components/ActionSection.tsx`

**Interfaces:**
- Add an optional `wheelItems` prop to `WheelEditor` for resolving slot names, icons, and descriptions independently from the draggable pool.
- `ActionSection` passes only one tile per built-in action template in `pool`; its current wheel slots are passed through `wheelItems`.

- [ ] **Step 1: Add a focused renderer test or type-level behavior test**

Add a test fixture for the action pool transformation if the existing renderer test setup supports it; otherwise expose a small pure helper from `ActionSection.tsx` and test that it returns one library item per action kind while returning all eight wheel items separately.

- [ ] **Step 2: Run the new test and verify it fails**

Run the focused renderer/action test and confirm the current pool still contains duplicate current-slot entries.

- [ ] **Step 3: Implement the generic metadata lookup**

Make `WheelEditor` use `wheelItems` plus `pool` when resolving wheel slot labels/icons, while rendering draggable tiles from `pool` only. Keep existing ping/emote call sites unchanged by falling back to `pool` when `wheelItems` is omitted.

- [ ] **Step 4: Add localized action display helpers**

In `ActionSection`, derive each library tile from `ACTION_TEMPLATES` and derive each wheel item from the current slot. Use the localized built-in name when the stored label still equals the built-in template label; preserve a user-edited label otherwise.

- [ ] **Step 5: Run typecheck and focused renderer tests**

Run:

```powershell
npm run typecheck
npx vitest run tests/renderer tests/shared/actions.test.ts
```

Expected: no type errors and all focused tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/settings/components/WheelEditor.tsx src/renderer/settings/components/ActionSection.tsx tests
git commit -m "fix: remove duplicate action library entries"
```

### Task 3: Add localized action descriptions and hover text

**Files:**
- Modify: `src/shared/i18n.ts`
- Modify: `src/renderer/settings/components/WheelEditor.tsx`
- Modify: `src/renderer/settings/components/ActionSection.tsx`
- Modify: `tests/shared/i18n.test.ts`

**Interfaces:**
- Add `actionDescriptions: Record<ActionKind, string>` to the English and Simplified Chinese string tables.
- Extend `PoolItem` with an optional `description`.

- [ ] **Step 1: Add i18n tests first**

Assert that every remaining action kind has a non-empty English and Chinese description and that the descriptions explain the parameter requirement for website/app/file/folder actions.

- [ ] **Step 2: Run the i18n test and verify it fails**

Expected: the new description table is missing.

- [ ] **Step 3: Implement descriptions and tooltip composition**

Add concise descriptions such as “Open the Windows snipping tool”, “Open a website configured below”, and their Chinese equivalents. Set `title` and `aria-label` on library tiles and wheel slots to include the action name and description. Keep the visible tile text concise.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
npx vitest run tests/shared/i18n.test.ts tests/shared/actions.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/i18n.ts src/renderer/settings/components/WheelEditor.tsx src/renderer/settings/components/ActionSection.tsx tests/shared/i18n.test.ts
git commit -m "feat: explain action wheel entries on hover"
```

### Task 4: Update product documentation and verify the Windows build

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Update documented defaults and available actions**

Change the action key default from Win to Shift and remove date/time clipboard actions from the action-wheel description. Document that hovering an action shows its purpose and any required configuration.

- [ ] **Step 2: Run the full focused verification**

Run:

```powershell
npx vitest run tests/shared/actions.test.ts tests/shared/settings.test.ts tests/shared/i18n.test.ts tests/main/actionExecutor.test.ts
npm run typecheck
npm run build:helper
npm run test:helper
```

Expected: all TypeScript tests pass, typecheck succeeds, and native helper tests report zero failures.

- [ ] **Step 3: Build the installable Windows artifact**

Run:

```powershell
npm run dist
```

Expected: `release/lolPing-Setup-0.5.0.exe` and `release/win-unpacked/lolPing.exe` are regenerated.

- [ ] **Step 4: Commit**

```powershell
git add AGENTS.md README.md README.zh-CN.md docs/superpowers/plans/2026-10-12-action-wheel-polish.md
git commit -m "docs: record action wheel usability polish"
```
