# Action Wheel Config Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make action wheel slots less noisy and more flexible by removing redundant folder shortcuts, requiring parameterized actions to be configured in a modal when placed, adding configurable volume steps, and fixing Show Desktop.

**Architecture:** Keep action definitions in shared code, execution in the Electron main process, and the generic wheel editor reusable for ping/emote/action wheels. Add small pure helpers for action configuration validation so behavior can be tested without a browser renderer.

**Tech Stack:** Electron, TypeScript, React, Fluent UI, Vitest, Windows Shell/keyboard actions.

## Global Constraints

- Preserve ping and emote wheel behavior.
- Keep the action wheel Windows-first.
- Do not keep a permanent action configuration panel under the wheel.
- Parameterized actions must not be placed from the library unless their required modal configuration is valid.
- Existing configured slots remain editable by clicking the slot.
- Build a Windows exe after the development round.

---

### Task 1: Update the shared action model

**Files:**
- Modify: `src/shared/actions.ts`
- Modify: `tests/shared/actions.test.ts`
- Modify: `tests/shared/settings.test.ts`

- [x] Remove `openDownloads`, `openDesktop`, and `openHome` from `ActionKind`, `ActionIcon`, and `ACTION_TEMPLATES`.
- [x] Add `volumeStep?: number` to `ActionSlot.params`.
- [x] Normalize volume actions so `volumeStep` is an integer from 1 to 10 and defaults to 1.
- [x] Update tests to expect the shorter action library and normalized volume params.

### Task 2: Fix execution behavior

**Files:**
- Modify: `src/main/actionExecutor.ts`
- Modify: `tests/main/actionExecutor.test.ts`

- [x] Change Show Desktop from injected Win+D to a hidden PowerShell Shell.Application `ToggleDesktop()` call.
- [x] Make volume up/down repeat their media-key injection according to `volumeStep`.
- [x] Remove executor branches and tests for the deleted known-folder actions.

### Task 3: Add modal configuration helpers and UI

**Files:**
- Create: `src/renderer/settings/actionConfig.ts`
- Create: `tests/renderer/actionConfig.test.ts`
- Modify: `src/renderer/settings/components/WheelEditor.tsx`
- Modify: `src/renderer/settings/components/ActionSection.tsx`
- Modify: `src/renderer/settings/settings.css`

- [x] Add pure helpers for identifying configurable actions, validating URL/path/volume-step params, and preparing configured slots.
- [x] Extend `WheelEditor` with an optional async `onBeforeApply` hook and optional target edit handler.
- [x] Replace the permanent bottom action editor with a Fluent UI dialog.
- [x] Gate library drops for URL/app/file/folder/volume actions until the dialog returns valid params.
- [x] Let users click existing configurable slots to reopen the dialog.

### Task 4: Update copy and docs, then package

**Files:**
- Modify: `src/shared/i18n.ts`
- Modify: `tests/shared/i18n.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `AGENTS.md`

- [x] Remove copy for deleted known-folder actions.
- [x] Add modal/volume-step wording.
- [x] Run focused tests, typecheck, helper tests, and `npm run dist`.
- [x] Commit the completed changes.
