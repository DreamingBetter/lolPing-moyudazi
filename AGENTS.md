# AGENTS.md

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
- After each development round, provide a way for the user to see the result. Prefer `npm run dev` for fast iteration; use `npm run dist` to create a Windows installer only when the user needs an installable build or release-style testing.
- For this Electron app, rebuilding the installer is not required for every code change. Rebuild the native helper with `npm run build:helper` when helper code changes, then run the app in development mode.
- On Windows dev machines where an installed lolPing instance has already used `%APPDATA%\lolPing`, start development with a separate Electron user-data directory to avoid cache and single-instance-lock conflicts:
  ```powershell
  $env:ELECTRON_CLI_ARGS='["--user-data-dir=C:\\Users\\DELL\\AppData\\Roaming\\lolPing-dev"]'
  npm run dev
  ```
- Record important product decisions and development conventions here as they emerge.

## Asset Notes

New wheel actions may need icons, sounds, or short animations. Ask the user for source images when using branded app/site icons, custom office icons, or entertainment assets that should match the user's taste.
