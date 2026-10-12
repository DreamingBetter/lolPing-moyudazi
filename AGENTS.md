# AGENTS.md

## Project Background

lolPing is an Electron + TypeScript desktop app that recreates the League of Legends ping/emote wheel on the desktop. It uses a native helper process to capture global input, transparent always-on-top overlay windows to render wheels and effects, and a Fluent UI settings window for configuration.

The planned second-development direction is to evolve the wheel from a game-style ping/emote toy into a configurable desktop shortcut wheel for office work and desktop operations.

## Current Product Direction

- Keep the "hold key + drag + release on a slice" interaction as the core gesture.
- Add a user-configurable action wheel for common desktop actions.
- Preserve the existing ping/emote wheel behavior unless we explicitly decide to replace it.
- Preserve the existing ping wheel and emote wheel, and add the action wheel alongside them rather than merging everything into one wheel.
- Use different trigger keys to open the ping, emote, and action wheels.
- Reuse the project's existing wheel rendering and editor patterns for the action wheel. Do not rewrite the ping/emote wheels into a new unified wheel framework for the first milestone.
- The action wheel's trigger key is user-configurable, following the existing project pattern for ping/emote triggers. Its default trigger should be Shift + drag on Windows because Win conflicts with system shortcuts.
- The first action-wheel milestone is Windows-first. Desktop operations should be implemented and verified on Windows; macOS may keep compatibility hooks or show unsupported states for actions that are not implemented there yet.
- The first screenshot action should invoke the Windows system snipping flow, equivalent to Win + Shift + S, rather than implementing custom screenshot capture.
- Initial action wheel scope is:
  - Quick launch: apps, websites, files, and folders.
  - Desktop operations: screenshots, lock screen, mute/volume, show desktop, and similar system actions.
- Do not add dedicated "open Desktop", "open Downloads", or "open user folder" actions; users can cover those with the configurable "open folder" action.
- Browser actions should use the system default browser. Do not open `about:blank` through Electron `shell.openExternal`, because Windows does not route the `about:` scheme through the default browser picker. Use a normal `https://` start URL for the "open browser" action and user-configured `https://` URLs for "open website".
- Show Desktop should use the Windows Shell `ToggleDesktop()` path rather than injecting Win + D, which can be swallowed by trigger-key state.
- Volume up/down actions are configurable actions with a `volumeStep` that represents the intended Windows volume delta. Valid values are even numbers from 2 to 20; execution converts the delta to media-key presses by dividing by 2.
- Volume action display names are derived from their configured delta, for example `Volume+2` / `音量+2` and `Volume-4` / `音量-4`; do not require users to edit a separate label for volume actions.
- The action wheel overlay should show an action hint after hovering one slice for about 2 seconds. Pass localized action labels and descriptions from overlay settings rather than hard-coding English in the overlay.
- Ship the action wheel with a sensible default 8-slot layout:
  - Screenshot
  - Mute/unmute
  - Show desktop
  - Lock screen
  - Open default browser
  - Open a configurable website
  - Open a configurable app
  - Open a configurable folder
- Users must be able to edit every parameterized action wheel slot.
- Provide more built-in action options than the default 8 so users can replace slots without needing to create everything from scratch.
- The action wheel editor should combine drag-and-drop and modal parameter editing: drag actions from the built-in library onto wheel slots; actions that need details open a modal and are placed only after valid configuration. Do not use a permanent configuration panel under the wheel. Click an existing parameterized slot to edit parameters such as URL, app path, file path, folder path, or volume step.
- Action library entries and wheel slots should expose a concise localized description on hover. Keep the visible label short, and make parameter requirements clear in the description.
- The overlay should only render the action wheel and report the selected action. Execute actions in the Electron main process so opening apps/files/URLs and system operations stay behind the main-process boundary.
- Do not add a separate entertainment wheel for now; the existing ping and emote wheels cover expressive/fun use cases.
- Prefer a practical first milestone: one configurable action wheel with safe, obvious actions before adding advanced automation.

## Development Habits

- Discuss and align design before implementation.
- Follow existing project patterns in `src/shared`, `src/main`, `src/renderer/overlay`, and `src/renderer/settings`.
- Keep settings normalized and versioned in shared code; validate anything user-editable.
- Keep global input capture conservative so normal desktop interactions are not hijacked unexpectedly.
- Add focused tests for settings normalization, wheel/action selection, and main-process action execution.
- After each development round, provide a way for the user to see the result. Prefer `npm run dev` for fast iteration; use `npm run dist` to create a Windows installer only when the user needs an installable build or release-style testing.
- For this Electron app, rebuilding the installer is not required for every code change. Rebuild the native helper with `npm run build:helper` when helper code changes, then run the app in development mode.
- `npm run dist` builds the Windows installer. The script uses `tools/build-win.mjs`, which points electron-builder at the already-installed `node_modules/electron/dist` and defaults `ELECTRON_BUILDER_BINARIES_MIRROR` to the npmmirror electron-builder-binaries mirror when no mirror is already configured. This avoids two common local Windows issues: hanging while unpacking Electron from the default cache and timing out while downloading NSIS from GitHub.
- On Windows dev machines where an installed lolPing instance has already used `%APPDATA%\lolPing`, start development with a separate Electron user-data directory to avoid cache and single-instance-lock conflicts:
  ```powershell
  $env:ELECTRON_CLI_ARGS='["--user-data-dir=C:\\Users\\DELL\\AppData\\Roaming\\lolPing-dev"]'
  npm run dev
  ```
- Record important product decisions and development conventions here as they emerge.

## Asset Notes

New wheel actions may need icons, sounds, or short animations. Ask the user for source images when using branded app/site icons, custom office icons, or entertainment assets that should match the user's taste.
