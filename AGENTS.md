# lolPing: working in this repo

This file is for everyone who changes code here: maintainers, contributors, and the AI agents either of them uses. It gives the context a change needs to fit the existing structure and keep the existing behaviour working. New features and ideas are welcome; the maintainer decides what goes in. If you are an agent, follow this file even when the person driving you doesn't mention it, and tell them when a change would break one of the guarantees below.

## What lolPing is

A League of Legends ping wheel for the Windows and macOS desktop. Hold a key, drag, release on a slice, and a League ping appears with its sound. Emotes and rooms (pinging with friends over the local network or public Nostr relays) are built on the same wheel. It starts with the system, sits in the tray, and stays out of the way of normal mouse and keyboard use.

Supported today: Windows 11 x64, and macOS 12+ on Apple Silicon.

## Guarantees to keep

Whatever a change adds, the app keeps doing these:

1. **Input passes through.** With lolPing on, every click, key and drag that isn't a wheel gesture reaches the app underneath exactly as it would without lolPing. With lolPing paused, nothing is swallowed. Input must never freeze, lag, drop or reorder.
2. **Both platforms.** A change for one OS doesn't change behaviour on the other. Gate it with `src/shared/platform.ts` in TypeScript, or put it in the platform's own file in `native/hook-helper/src` (`hooks_win.cpp`, `hooks_mac.cpp`).
3. **Both languages.** Every user-facing string lives in `src/shared/i18n.ts` with an English and a Simplified Chinese entry. No hard-coded UI text. A README change goes into both `README.md` and `README.zh-CN.md`.
4. **Old settings and old peers keep working.** `normalizeSettings` in `src/shared/settings.ts` turns any old or broken settings file into valid settings, so new fields need a default there. Room messages (`src/shared/roomProtocol.ts`) stay readable by older apps; when that can't be done, bump `PROTOCOL_VERSION` so older peers show "needs update". A new relay list keeps at least 3 relays from the old one (see `src/main/relays.ts`).
5. **Network use is visible.** The app talks to GitHub for update checks, and to the relays and the local network while the user is in a room. Say so in the pull request when a change adds a new host, and describe it in the README's privacy notes.
6. **Bundled League assets come from `tools/extract-assets`,** so they can be extracted again after a patch.

## Layout

| Path | What lives there |
| --- | --- |
| `native/hook-helper/` | C++ input helper: global hooks (Windows) or event tap (macOS). The gesture state machine is `decision.cpp`, tested by `tests/helper_tests.cpp`. Talks to Electron in JSON lines (`src/shared/protocol.ts`). |
| `src/main/` | Electron main process: helper bridge, overlays, settings store, rooms, updater, tray |
| `src/preload/` | The bridge each window gets. Expose only what that window needs. |
| `src/renderer/overlay/` | The wheel and pings, plain TypeScript and DOM, no framework |
| `src/renderer/settings/` | The settings window, React + Fluent UI v9 |
| `src/shared/` | Pure code used by every process: settings, protocols, i18n, ping tables. No Electron or Node imports. |
| `tests/` | Vitest tests, mirroring `src/` |
| `site/` | The browser demo, reusing the overlay code |
| `tools/` | Asset extraction, media capture, room and relay test tools |
| `docs/design.md`, `docs/design-macos.md` | How it works and why. Read the part you change, and update it when behaviour changes. |

Put new code where its neighbours live. A new IPC channel goes in `src/shared/ipc.ts` or `settingsChannels.ts`, a new setting in `src/shared/settings.ts`, a new string in `i18n.ts`. Reuse what's there before adding something parallel to it.

## Code conventions

- **Match the file you're in.** TypeScript is strict. 2-space indent, single quotes, semicolons, lines up to about 120 characters. There is no formatter, so don't reformat code you didn't change.
- **Types:** no `any`, `@ts-ignore` or non-null assertions to quiet the compiler. Validate untrusted data (settings files, IPC, room packets, helper output) from `unknown`, the way `normalizeSettings` and `validateMessage` do.
- **Keep logic out of the glue.** Decisions go in small pure modules that tests can call directly (`decision.cpp`, `keyCaptureLogic.ts`, `updateView.ts`, `floodGuard.ts`). Electron, DOM and OS code stays thin. Pass time in (`now: () => number`) instead of reading the clock in logic.
- **Comments say why, not what.** One short line is usual. Exported things get a one-line `/** */` when the name doesn't say it all.
- **Keep the diff to the change.** No drive-by renames, refactors or reformatting in the same commit. No dead code left behind.
- **Dependencies** are pinned exactly (`npm install --save-exact`). Change `package-lock.json` only when a dependency changes.
- **Releases are the maintainer's.** Leave `version` in `package.json` and `.github/workflows/release.yml` alone. Never commit `out/`, `release/`, `site-dist/` or helper builds.

## Tests

Run these before calling a change done. CI runs them on Windows and macOS, and `main` only accepts changes that pass.

```bash
npm run typecheck
npm run test:helper
npm test
```

- TypeScript tests live in `tests/<area>/<module>.test.ts`, mirroring `src/<area>/<module>.ts`. Native tests go in `native/hook-helper/tests/helper_tests.cpp`.
- One `describe` per module or class, named after it. Each `it` states the behaviour in plain words: `it('caps the total even when every packet claims a different source')`.
- New logic comes with tests. A bug fix comes with a test that fails without the fix, unless the bug is only reachable through the OS or the screen. Then say how you checked it by hand.
- Test behaviour, not mocks. A test that only checks a mock was called doesn't test the feature.
- Tests are deterministic: inject time, no real network (use the fakes in `tests/main/fixtures/`), no fixed sleeps (wait for the condition instead).
- Anything about input, overlays, windows or sound needs a run of the real app (`npm run dev`) on the OS it touches. Passing tests don't prove it.

## Commits and pull request titles

Use [Conventional Commits](https://www.conventionalcommits.org/). Pull requests are squash-merged, so the pull request title becomes the commit on `main` and follows the same format.

```
<type>(<scope>): <what changes, imperative, lower case, no period>
```

- **Types:** `feat` (new behaviour), `fix` (bug fix), `perf`, `refactor` (no behaviour change), `test`, `docs`, `build` (packaging, dependencies), `ci`, `chore`.
- **Scope** is optional and names the area: `helper`, `overlay`, `settings`, `rooms`, `emotes`, `updater`, `tray`, `mac`, `win`, `i18n`, `site`.
- Examples: `fix(helper): exit when lolPing is gone, even if the hook thread is wedged`, `feat(emotes): add a size setting for the emote wheel`, `test(settings): wait for the save on disk instead of a fixed sleep`.
- Body, when it isn't obvious: why the change is needed and how it works, wrapped at about 72 characters. Reference issues as `Fixes #9` or `Refs #9`.
- A breaking change to settings or the room protocol gets `!` after the type and a `BREAKING CHANGE:` line in the body.
- One logical change per commit. Code, comments, identifiers and commit messages are in English.

## Writing

The README, design docs and UI strings use short, plain sentences. Say what something does, not how great it is: no marketing words, no emoji, no bold lead-ins on every bullet. Keep the Chinese as plain as the English.

## For AI agents

- Read the files you change, their tests and the matching section of `docs/design.md` before editing. Use the existing APIs, settings keys and IPC channels instead of inventing parallel ones.
- Follow the structure in Layout above, even when another structure seems tidier. Propose restructuring separately.
- Don't claim something was tested unless the command was run in this session or the person says they checked it by hand. Report failing tests as failing.
- Pull request descriptions follow `.github/pull_request_template.md`: short and true to the diff.

## Project-specific product direction

## Project Background

lolPing is an Electron + TypeScript desktop app that recreates the League of Legends ping/emote wheel on the desktop. It uses a native helper process to capture global input, transparent always-on-top overlay windows to render wheels and effects, and a Fluent UI settings window for configuration.

The planned second-development direction is to evolve the wheel from a game-style ping/emote toy into a configurable desktop shortcut wheel for office work, desktop operations, and light entertainment.

## Current Product Direction

- Keep the "hold key + drag + release on a slice" interaction as the core gesture.
- Add a user-configurable action wheel for common desktop actions.
- Preserve the existing ping/emote wheel behavior unless we explicitly decide to replace it.
- Preserve the existing ping wheel and emote wheel, and add the action wheel alongside them rather than merging everything into one wheel.
- Use different trigger keys to open the ping, emote, and action wheels.
- Reuse the project's existing wheel rendering and editor patterns for the action wheel. Do not rewrite the ping/emote wheels into a new unified wheel framework for the first milestone.
- The action wheel's trigger key is user-configurable, following the existing project pattern for ping/emote triggers. Its default trigger should be Win + drag.
- The first action-wheel milestone is Windows-first. Desktop operations should be implemented and verified on Windows; macOS may keep compatibility hooks or show unsupported states for actions that are not implemented there yet.
- The first screenshot action should invoke the Windows system snipping flow, equivalent to Win + Shift + S, rather than implementing custom screenshot capture.
- Initial action wheel scope is:
  - Quick launch: apps, websites, files, and folders.
  - Desktop operations: screenshots, lock screen, mute/volume, show desktop, and similar system actions.
- Ship the action wheel with a sensible default 8-slot layout:
  - Screenshot
  - Mute/unmute
  - Show desktop
  - Lock screen
  - Open default browser
  - Open a configurable website
  - Open a configurable app
  - Open a configurable folder
- Users must be able to edit every action wheel slot.
- Provide more built-in action options than the default 8 so users can replace slots without needing to create everything from scratch.
- The action wheel editor should combine drag-and-drop and parameter editing: drag actions from the built-in library onto wheel slots, and click a slot/action to edit parameters such as URL, app path, file path, or folder path.
- The overlay should only render the action wheel and report the selected action. Execute actions in the Electron main process so opening apps/files/URLs and system operations stay behind the main-process boundary.
- Do not add a separate entertainment wheel for now; the existing ping and emote wheels cover expressive/fun use cases.
- Prefer a practical first milestone: one configurable action wheel with safe, obvious actions before adding advanced automation.

## Development Habits

- Discuss and align design before implementation.
- Follow existing project patterns in `src/shared`, `src/main`, `src/renderer/overlay`, and `src/renderer/settings`.
- Keep settings normalized and versioned in shared code; validate anything user-editable.
- Keep global input capture conservative so normal desktop interactions are not hijacked unexpectedly.
- Add focused tests for settings normalization, wheel/action selection, and main-process action execution.
- Default ongoing development should happen in one long-lived integration worktree and branch instead of creating a fresh branch/worktree for every small task. Use `.worktrees/develop` on `develop` unless the user asks otherwise.
- Multiple Codex sessions may work on that same branch for this solo project, but each session must run `git status --short --branch` before editing, avoid concurrently editing the same files, preserve dirty changes it did not make, and commit completed slices frequently.
- Create a separate branch/worktree only for risky experiments, release isolation, or work that is likely to conflict heavily. Delete stale worktrees/branches after confirming their changes are merged or intentionally abandoned.
- After each development round, provide a way for the user to see the result. Prefer `npm run dev` for fast iteration; use `npm run dist` to create a Windows installer only when the user needs an installable build or release-style testing.
- For this Electron app, rebuilding the installer is not required for every code change. Rebuild the native helper with `npm run build:helper` when helper code changes, then run the app in development mode.
- On the action-wheel branch/worktree, `npm run dist` builds the Windows installer through `tools/build-win.mjs`, which points electron-builder at the already-installed `node_modules/electron/dist` and defaults `ELECTRON_BUILDER_BINARIES_MIRROR` to the npmmirror electron-builder-binaries mirror when no mirror is already configured. This avoids two common local Windows issues: hanging while unpacking Electron from the default cache and timing out while downloading NSIS from GitHub.
- On Windows dev machines where an installed lolPing instance has already used `%APPDATA%\lolPing`, start development with a separate Electron user-data directory to avoid cache and single-instance-lock conflicts:
  ```powershell
  $env:ELECTRON_CLI_ARGS='["--user-data-dir=C:\\Users\\DELL\\AppData\\Roaming\\lolPing-dev"]'
  npm run dev
  ```
- Record important product decisions and development conventions here as they emerge.

## Asset Notes

New wheel actions may need icons, sounds, or short animations. Ask the user for source images when using branded app/site icons, custom office icons, or entertainment assets that should match the user's taste.
