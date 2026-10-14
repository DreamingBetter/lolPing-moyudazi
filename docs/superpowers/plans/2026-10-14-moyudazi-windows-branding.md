# Moyudazi Windows Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the fork as `lolPing-摸鱼搭子`, move update/source links to `DreamingBetter/lolPing-moyudazi-Windows`, and make releases Windows-only.

**Architecture:** Keep runtime feature code mostly intact and centralize new product/repository constants in shared code. Wire main-process update links and settings project links through those constants, update package/electron-builder metadata, and simplify the GitHub release workflow to a Windows-only release.

**Tech Stack:** Electron, TypeScript, electron-builder, electron-updater, GitHub Releases, Vitest.

## Global Constraints

- Work in `.worktrees/develop` on branch `develop`.
- App display name is `lolPing-摸鱼搭子`.
- Installation package names use ASCII `moyudazi`, not Chinese.
- Treat this as a new Windows-only app rather than an in-place continuation of original lolPing.
- Update source must be `DreamingBetter/lolPing-moyudazi-Windows`.
- Keep mac runtime compatibility code unless removing it is necessary for Windows-only packaging.
- Update `AGENTS.md` with the branding, Windows-only release, and update-source decisions.

---

### Task 1: Branding And Update Constants

**Files:**
- Create: `src/shared/branding.ts`
- Modify: `src/main/settingsIpc.ts`
- Modify: `src/main/updateWin.ts`
- Test: `tests/shared/branding.test.ts`
- Test: `tests/main/settingsIpc.test.ts`
- Test: `tests/main/updateWin.test.ts`

**Interfaces:**
- Produces: `APP_DISPLAY_NAME`, `PACKAGE_NAME`, `GITHUB_OWNER`, `GITHUB_REPO`, `PROJECT_URL`, `LATEST_RELEASE_URL`, `releaseTagUrl(version: string)`.

- [x] **Step 1: Write failing tests**

Assert the constants point to `DreamingBetter/lolPing-moyudazi-Windows`, settings fallback release page opens the new latest release URL, and Windows update notes point to the new tag URL.

- [x] **Step 2: Run red tests**

Run: `npm run test -- tests/shared/branding.test.ts tests/main/settingsIpc.test.ts tests/main/updateWin.test.ts`

- [x] **Step 3: Implement constants and wire consumers**

Create `branding.ts` and replace hard-coded update/project URLs in `settingsIpc.ts` and `updateWin.ts`.

- [x] **Step 4: Run green tests**

Run: `npm run test -- tests/shared/branding.test.ts tests/main/settingsIpc.test.ts tests/main/updateWin.test.ts`

### Task 2: Windows-Only Package And Release Metadata

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/release.yml`
- Modify: `tests/shared/releaseWorkflow.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces package metadata with `name: lolping-moyudazi-windows`, `productName: lolPing-摸鱼搭子`, `appId: com.dreamingbetter.lolping.moyudazi.windows`, and `artifactName: lolPing-moyudazi-Setup-${version}.exe`.
- Produces release workflow that uploads Windows installer, `latest.yml`, and blockmap only.

- [x] **Step 1: Write failing tests**

Update release workflow expectations to require `lolPing-moyudazi-Setup` and no mac release job.

- [x] **Step 2: Run red tests**

Run: `npm run test -- tests/shared/releaseWorkflow.test.ts`

- [x] **Step 3: Update metadata and workflow**

Edit package metadata, remove the mac build script/config from package metadata, and remove the mac job from the workflow.

- [x] **Step 4: Run green tests**

Run: `npm run test -- tests/shared/releaseWorkflow.test.ts`

### Task 3: Verify And Package

**Files:**
- Generated: `release/lolPing-moyudazi-Setup-0.5.0.exe`
- Generated: `release/win-unpacked/lolPing-摸鱼搭子.exe`

- [x] **Step 1: Verify**

Run:
- `npm run test`
- `npm run typecheck`
- `npm run dist`

- [x] **Step 2: Commit**

Commit with message `Rebrand Windows release as Moyudazi`.

## Self-Review

- Spec coverage: covers application display name, ASCII installer naming, new GitHub update source, Windows-only release workflow, and AGENTS documentation.
- Placeholder scan: no placeholders remain.
- Type consistency: branding constants are string exports consumed by main-process modules and tests.
