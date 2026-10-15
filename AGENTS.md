# AGENTS.md

## Project Background

lolPing-摸鱼搭子 is an Electron + TypeScript Windows desktop app that recreates the League of Legends ping/emote wheel on the desktop. It uses a native helper process to capture global input, transparent always-on-top overlay windows to render wheels and effects, and a Fluent UI settings window for configuration.

The planned second-development direction is to evolve the wheel from a game-style ping/emote toy into a configurable desktop shortcut wheel for office work and desktop operations.

## Current Product Direction

- Keep the "hold key + drag + release on a slice" interaction as the core gesture.
- Treat this fork as a new Windows-only app named `lolPing-摸鱼搭子`. The npm/internal package name is `lolping-moyudazi`, the Windows app id is `com.dreamingbetter.lolping.moyudazi.windows`, and release installer files use ASCII `lolPing-moyudazi-Setup-${version}.exe`.
- The GitHub project/update source is `DreamingBetter/lolPing-moyudazi`. App update links, release notes links, `package.json` publish config, and release workflow uploads should point there rather than the original author repository.
- Add a user-configurable action wheel for common desktop actions.
- Preserve the existing ping/emote wheel behavior unless we explicitly decide to replace it.
- Preserve the existing ping wheel and emote wheel, and add the action wheel alongside them rather than merging everything into one wheel.
- Use different trigger keys to open the ping, emote, and action wheels.
- Reuse the project's existing wheel rendering and editor patterns for the action wheel. Do not rewrite the ping/emote wheels into a new unified wheel framework for the first milestone.
- The action wheel's trigger key is user-configurable, following the existing project pattern for ping/emote triggers. Its default trigger should be Shift + drag on Windows because Win conflicts with system shortcuts.
- The app is Windows-only for active development and releases. macOS compatibility code may remain as legacy scaffolding, but do not add macOS release workflow, macOS installer output, or new macOS-specific product work unless the user explicitly reopens that scope.
- The first screenshot action should invoke the Windows system snipping flow, equivalent to Win + Shift + S, rather than implementing custom screenshot capture.
- Initial action wheel scope is:
  - Quick launch: apps, websites, files, and folders.
  - Desktop operations: screenshots, lock screen, mute/volume, show desktop, and similar system actions.
- Do not add dedicated "open Desktop", "open Downloads", or "open user folder" actions; users can cover those with the configurable "open folder" action.
- Browser actions should use the system default browser. Do not open `about:blank` through Electron `shell.openExternal`, because Windows does not route the `about:` scheme through the default browser picker. Use a normal `https://` start URL for the "open browser" action and user-configured `https://` URLs for "open website".
- Do not add a generic shortcut/hotkey action for now. It is useful but riskier because shortcuts are easy to conflict with normal app or system behavior.
- Do not add a generic icon picker for now. Most built-in action icons are clear enough; only repeated website/app slots need stronger visual distinction.
- Configured "open website" slots should try to use the site's favicon, and configured "open app" slots should try to use the local application's icon. Store only small generated `data:image/...` icons in action slot params, and fall back to the built-in `web` or `app` icon when extraction fails.
- Show Desktop should use the Windows Shell `ToggleDesktop()` path rather than injecting Win + D, which can be swallowed by trigger-key state.
- Volume up/down actions are configurable actions with a `volumeStep` that represents the intended Windows volume delta. Valid values are even numbers from 2 to 20; execution converts the delta to media-key presses by dividing by 2.
- Volume action display names are derived from their configured delta, for example `Volume+2` / `音量+2` and `Volume-4` / `音量-4`; do not require users to edit a separate label for volume actions.
- The action wheel overlay should show an action hint after hovering one slice for about 1.2 seconds. Pass localized action labels and descriptions from overlay settings rather than hard-coding English in the overlay.
- Ship the action wheel with this default 8-slot layout, starting at the top and moving clockwise:
  - Screenshot
  - Lock screen
  - Volume up
  - Open default browser
  - Mute/unmute
  - Open website, configured to `https://www.baidu.com`
  - Volume down
  - Show desktop
- Users must be able to edit every parameterized action wheel slot.
- Provide more built-in action options than the default 8 so users can replace slots without needing to create everything from scratch.
- The action wheel editor should combine drag-and-drop and modal parameter editing: drag actions from the built-in library onto wheel slots; actions that need details open a modal and are placed only after valid configuration. Do not use a permanent configuration panel under the wheel. Click an existing parameterized slot to edit parameters such as URL, app path, file path, folder path, or volume step.
- Do not put generic instructional copy inside action configuration dialogs when validation and disabled save states already express the requirement. Keep these dialogs focused on the fields the user actually edits.
- When a configurable built-in action opens in the parameter dialog, its default label should be localized to the current UI language before saving. Preserve labels the user has already customized.
- Action library entries and wheel slots should expose a concise localized description on hover. Keep the visible label short, and make parameter requirements clear in the description.
- The overlay should only render the action wheel and report the selected action. Execute actions in the Electron main process so opening apps/files/URLs and system operations stay behind the main-process boundary.
- Do not add a separate entertainment wheel for now; the existing ping and emote wheels cover expressive/fun use cases.
- Prefer a practical first milestone: one configurable action wheel with safe, obvious actions before adding advanced automation.
- Add a Windows system-level cursor skin feature after design alignment. The user wants a 光标精灵-style cursor pack switcher rather than an overlay-only fake cursor.
- The cursor skin feature should not support user-imported custom packs. It exposes only the bundled Summoner cursor packs from user-provided assets.
- The settings UI for cursor skins should present one `召唤师鼠标指针` radio group instead of separate switches. The options are `系统指针`, `新版指针`, and `旧版指针`; choosing system restores the user's original Windows cursor scheme.
- The default Summoner cursor pack is the newer `assets/cursors/summoner` pack. The optional old League cursor pack lives in `assets/cursors/summoner-classic`, is selected by the `cursorSkinClassic` setting, and only uses the bundled ASCII-named `.cur` / `.ani` files extracted from `鼠标指针.zip`'s `yxlm` folder.
- System cursor skins should use Windows `.cur` / `.ani` files and a full cursor-role mapping. Prefer the same durable mechanism as Windows Mouse Properties/cursor pack tools: copy/install the files to a stable user-data location, write the per-user cursor scheme under `HKCU\Control Panel\Cursors`, then ask Windows to reload cursors with `SystemParametersInfo(SPI_SETCURSORS)`.
- Avoid using `SetSystemCursor` as the primary implementation for persistent skins because it replaces in-memory system cursors directly and is harder to restore safely.
- Before applying any cursor skin, back up the user's current cursor values and provide an obvious restore action. Cursor changes are global to the current Windows user, so failures must leave a clear recovery path.
- The Summoner cursor switch copies bundled cursor files into `%APPDATA%\lolPing-moyudazi\cursors\summoner` before writing registry values. Keep registry paths pointed at this stable user-data copy rather than the install/build output.
- If applying Summoner fails after a backup exists, attempt to write the backup values back immediately, but keep the backup file so the user can still turn the switch off later.
- After writing `HKCU\Control Panel\Cursors`, refresh with `SystemParametersInfo(SPI_SETCURSORS, 0, NULL, SPIF_SENDCHANGE)`, i.e. `fWinIni = 0x0002`. Do not pass `0x0003`; including `SPIF_UPDATEINIFILE` made `SPI_SETCURSORS` return false on the user's Windows build.
- Mark newly added settings features with a prominent red/orange `NEW` text badge in every UI language. This should usually be an eye-catching badge beside the feature title rather than an extra icon, so it does not compete with the feature's own navigation icon. If a settings section contains a new feature row, mark both the row/title and that section's side-nav tab.
- Room chat keeps only the latest 200 in-memory messages. The chat composer placeholder should show two lines: the Enter/Shift+Enter send hint first, then the "recent 200 messages" retention hint.
- Heartsteel gameplay is a League-inspired desktop mini-game with a global setting. It must stay visible even when the user is not in a room: idle mode runs solo on this machine, active-room mode uses synchronized room targets and claims. Each user has persistent personal Heartsteel progress: base max health is 2000, saved bonus health starts at 0, displayed stacks equal bonus health, and hits add permanent bonus health only to the clicker.
- Heartsteel hit math is integer based: damage is `Math.round(125 + maxHealth * 0.06)`, bonus gain is `Math.round(damage * 0.1)`, and no other player's health is reduced.
- Heartsteel target scheduling should not introduce a room-owner concept. Elect the active member with the lowest peer id as the temporary scheduler. Clickers send target claims, and only the scheduler broadcasts the final hit so all clients converge on one winner.
- Heartsteel desktop targets should use conservative overlay hit testing. Keep normal desktop interaction click-through outside the active target, preferably with Windows `BrowserWindow.setShape()` around the target hit area.
- Heartsteel health bars represent current health, not growth progress. Current health is full by default, so render the bar filled in green. Use LoL-like density cues: small ticks represent 100 max health and heavier ticks represent 1000 max health, so ticks become denser as max health grows.

## Development Habits

- Discuss and align design before implementation.
- Follow existing project patterns in `src/shared`, `src/main`, `src/renderer/overlay`, and `src/renderer/settings`.
- Keep settings normalized and versioned in shared code; validate anything user-editable.
- Keep global input capture conservative so normal desktop interactions are not hijacked unexpectedly.
- Add focused tests for settings normalization, wheel/action selection, and main-process action execution.
- Do all ongoing development in the repository's main directory on the `main` branch. Do not recreate `.worktrees/develop`, use a `develop` branch, or create another worktree unless the user explicitly requests it.
- Multiple Codex sessions may work in this main directory, but each session must run `git status --short --branch` before editing, avoid concurrently editing the same files, preserve dirty changes it did not make, and commit completed slices frequently.
- Before pulling, merging, or releasing, inspect the current `main` status and reconcile any local changes there. Keep the working directory and GitHub's `main` branch aligned so version and release work is visible in the same place as development.
- After each development round, run `npm run dist` from the main directory and leave both local preview artifacts in `release/`: `release/win-unpacked/lolPing-摸鱼搭子.exe` for direct launch and `release/lolPing-moyudazi-Setup-${version}.exe` for installation. Check that both exist before handing off. `npm run dev` remains useful during implementation, but it does not refresh these artifacts.
- `release/` and `out/` are local generated output and are ignored by Git. A GitHub Release is a separate publication step; building local preview artifacts does not update the published release.
- `npm run dist` builds the Windows unpacked app and NSIS installer. The script uses `tools/build-win.mjs`, which points electron-builder at the already-installed `node_modules/electron/dist` and defaults `ELECTRON_BUILDER_BINARIES_MIRROR` to the npmmirror electron-builder-binaries mirror when no mirror is already configured. This avoids two common local Windows issues: hanging while unpacking Electron from the default cache and timing out while downloading NSIS from GitHub.
- On Windows dev machines where an installed lolPing instance has already used `%APPDATA%\lolPing`, start development with a separate Electron user-data directory to avoid cache and single-instance-lock conflicts:
  ```powershell
  $env:ELECTRON_CLI_ARGS='["--user-data-dir=C:\\Users\\DELL\\AppData\\Roaming\\lolPing-dev"]'
  npm run dev
  ```
- Record important product decisions and development conventions here as they emerge.

## Asset Notes

New wheel actions may need icons, sounds, or short animations. Ask the user for source images when using branded app/site icons, custom office icons, or entertainment assets that should match the user's taste.

Cursor skin assets:

- The Summoner cursor pack from `D:\cc_workspace\lolping\Summoner.zip` was extracted into:
  - `assets/cursors/summoner` for the main Windows cursor-role set.
  - `assets/cursors/summoner-extra` for optional replacement/extra cursor variants.
- `.cur` and `.ani` files are suitable for Windows system cursor schemes. Keep file names ASCII when adding bundled packs so packaging and registry paths stay predictable.

Heartsteel assets:

- The provided reference images and the original audio copy are in `assets/heartsteel/`. The app loads `assets/sounds/heartsteel.mp3`; keep that file in place when editing or packaging the Heartsteel sound. The original audio copy is identical and is not the runtime path. Keep it outside `assets/sounds/`, because the build prunes unused sounds from that directory.
- Recreate the Heartsteel target effect from the reference image with CSS/Canvas rather than using the tiny reference image directly as the visible target.
