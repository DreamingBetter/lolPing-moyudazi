# Action Wheel - Design Spec

**Date:** 2026-10-10
**Status:** Approved in brainstorming; not yet implemented
**Target:** next feature milestone after v0.5.0
**Builds on:** the shipped ping wheel, the emote wheel, the shared wheel editor, and the helper's multi-wheel input model.

## 1. Purpose

Add a third wheel, the **action wheel**, for high-frequency desktop work. The user holds a trigger key, drags to open the wheel, releases on a slice, and lolPing performs the configured action.

The existing ping wheel and emote wheel stay intact. This feature adds one more configurable wheel beside them.

**First milestone scope:**
1. Windows first. macOS may keep compatible settings and unsupported states, but Windows behavior is the release target.
2. One action wheel with 8 configurable slots.
3. Built-in actions for quick launch and desktop operations.
4. Reuse the current wheel rendering and settings editor patterns instead of replacing the ping/emote wheel architecture.

**Success criteria:**
1. Win + drag opens the action wheel by default. The trigger can be changed in settings.
2. Alt + drag still opens the ping wheel, and Ctrl + drag still opens the emote wheel by default.
3. Releasing on an action slice runs that slot's configured action through the main process.
4. Users can replace every slot and edit parameters for actions such as URL, app path, file path, and folder path.
5. The first Windows desktop actions work without asking users to install extra tools.

## 2. Decisions Log

| Topic | Decision |
|---|---|
| Number of new wheels | Add one action wheel. Do not add a separate entertainment wheel; ping and emote already cover expressive/fun use cases. |
| Default trigger | Win + drag. The trigger is configurable using the same trigger picker pattern as ping/emote. |
| Platform | Windows-first for the first milestone. |
| Wheel shape | Reuse the existing `Wheel` class and League-style 8-slice visual treatment. |
| Settings editor | Reuse the `WheelEditor` interaction style: drag actions from a pool onto slots, and click a slot to edit parameters. |
| Execution boundary | Overlay only reports the selected action. The Electron main process executes actions. |
| Screenshot | Invoke the Windows system snipping flow, equivalent to Win + Shift + S. Do not implement custom screenshot capture in M1. |
| Safety | No shutdown, restart, file deletion, arbitrary script execution, or deep system mutation in M1. |

## 3. Default Wheel and Action Library

### 3.1 Default 8-Slot Layout

Top (N), then clockwise:

1. Screenshot
2. Mute/unmute
3. Show desktop
4. Lock screen
5. Open default browser
6. Open website
7. Open app
8. Open folder

The website, app, and folder defaults are editable starter entries. A slot with an incomplete parameter should show clearly in settings and do nothing with a short toast when selected, rather than failing silently.

### 3.2 Built-In Action Options

**Quick launch:**
- Open default browser
- Open URL
- Open app
- Open file
- Open folder
- Open Downloads folder
- Open Desktop folder
- Open user home folder

**Desktop operations:**
- Screenshot
- Show desktop
- Lock screen
- Mute/unmute
- Volume up
- Volume down
- Copy current date
- Copy current time

M1 intentionally excludes power actions, arbitrary shell commands, and multi-step automation.

## 4. Data Model

Add a shared action model, but keep it scoped to the new action wheel. Do not refactor ping/emote into this model in M1.

```ts
export type ActionKind =
  | 'screenshot'
  | 'showDesktop'
  | 'lockScreen'
  | 'muteToggle'
  | 'volumeUp'
  | 'volumeDown'
  | 'openBrowser'
  | 'openUrl'
  | 'openApp'
  | 'openFile'
  | 'openFolder'
  | 'openDownloads'
  | 'openDesktop'
  | 'openHome'
  | 'copyDate'
  | 'copyTime';

export interface ActionSlot {
  id: string;
  kind: ActionKind;
  label: string;
  icon: string;
  params?: {
    url?: string;
    path?: string;
  };
}
```

Notes:
- `id` is stable per slot instance so overlay can report a selected action without serializing the entire action through IPC.
- `kind` determines validation and execution.
- `label` is what the wheel and settings editor show.
- `icon` is an app-owned icon key in M1. User-provided icons can be added later.
- `params.url` is used only by `openUrl`.
- `params.path` is used by `openApp`, `openFile`, and `openFolder`.
- Launch arguments for apps are out of scope for M1.

## 5. Settings

### 5.1 New Settings Fields

Add these fields to `Settings`:

| Field | Type | Default | Normalization |
|---|---|---|---|
| `actionTrigger` | `TriggerKey \| 'off'` | `'win'` | If it clashes with ping/emote trigger or the pause shortcut, set to `'off'` and note a problem. |
| `actionWheel` | `ActionSlot[8]` | default layout | Must normalize to 8 valid actions. Invalid slots fall back to the default for that position. |

M1 has no center-click action for the action wheel. All action execution comes from releasing on one of the 8 slices.

Trigger clash rules:
- Ping, emote, and action triggers cannot be the same physical trigger.
- If two triggers are held at the same time when the drag starts, the helper should pass the input through untouched, matching the emote-wheel ambiguity rule.
- A custom key trigger cannot equal the pause shortcut key.

### 5.2 Settings UI

Add an **Action Wheel** section to the settings window.

The section contains:
- Action trigger picker, defaulting to Win.
- Action wheel editor with 8 slots.
- Action pool grouped as **Quick launch** and **Desktop operations**.
- Parameter editor for the selected slot.

Editor behavior:
- Drag an action from the pool to a slot to replace it.
- Drag one slot to another slot to swap them.
- Click a slot to select it and edit parameters.
- Actions without required parameters only allow simple metadata edits such as label.
- Actions with parameters show focused fields:
  - Open URL: label and URL.
  - Open app: label and app path.
  - Open file: label and file path.
  - Open folder: label and folder path.
- Path actions should offer browse buttons in the settings renderer, routed through main-process dialogs.
- A reset button restores the default 8-slot layout.

Validation should happen both in the renderer for helpful inline feedback and again in shared/main code for safety.

## 6. Input and Overlay

### 6.1 Helper Protocol

Extend `WheelKind` to:

```ts
export type WheelKind = 'ping' | 'emote' | 'action';
```

`config` gains:
- `actionTrigger`
- `actionTriggerVk`

Every point event already carries or can carry `wheel`; action uses the same event shape as ping/emote:
- `wheelOpen`
- `wheelMove`
- `wheelRelease`
- `click`
- `cancel`

The helper should keep the same guarantees it has today:
- Paired swallowed down/up events.
- Esc and right-click cancel.
- Watchdog cancel.
- Trigger release mid-gesture cancels or follows the existing owner-trigger behavior.
- Settings capture suspends all wheel triggers.

### 6.2 Overlay Renderer

The overlay creates a third `Wheel` instance:
- center label: `ACTION`
- center icon: built-in action icon
- slice items from `OverlaySettings.actionWheel`

On release:
1. Resolve the chosen slot by id/key.
2. Send `OVERLAY_ACTIONED` to main with `{ id, x, y }`.
3. Do not execute anything in the renderer.

If the selected action is invalid or missing required parameters, main sends a toast back to the overlay.

## 7. Main-Process Execution

Add an action executor in main, for example `src/main/actionExecutor.ts`.

Responsibilities:
- Validate the selected slot against normalized settings.
- Execute supported actions through Electron, Node, or a small Windows-specific path.
- Return a typed result so callers can show a toast on unsupported or failed actions.

Suggested execution map:

| Action | Windows behavior |
|---|---|
| Screenshot | Simulate Win + Shift + S, using the existing native helper if appropriate, or a main-process Windows input path. |
| Show desktop | Simulate Win + D. |
| Lock screen | Run `rundll32.exe user32.dll,LockWorkStation`. |
| Mute/unmute | Simulate the media volume mute key. |
| Volume up/down | Simulate media volume keys. |
| Open default browser | `shell.openExternal('https://www.google.com')` or a neutral browser launch strategy. |
| Open URL | `shell.openExternal(validUrl)`. |
| Open app/file/folder | `shell.openPath(path)` after validation. |
| Open Downloads/Desktop/Home | Resolve known user directories and `shell.openPath`. |
| Copy date/time | `clipboard.writeText(formattedValue)`, then toast. |

Open default browser should not hard-code a private user URL. If no explicit URL is configured, use a neutral URL or open the browser through the OS default handler if Electron supports it cleanly.

Execution should not block the UI. Long-running work is not expected in M1, but the executor should still use async APIs where available.

### 7.1 Windows-Only Actions on macOS

For M1, unsupported macOS actions return `unsupported`. The settings UI can still show the action wheel if the app is running on macOS, but unsupported actions should be clearly labelled or disabled.

## 8. Assets and Icons

M1 can use built-in vector/icon components in settings and simple packaged image/icon keys in overlay. If the overlay needs bitmap assets, add small app-owned icons under `assets/` rather than using brand icons without user-provided assets.

Ask the user for image assets when:
- An app/site needs a branded icon.
- The user wants custom visual identity for action slots.
- A future custom icon import feature is added.

## 9. Error Handling

| Situation | Behavior |
|---|---|
| Missing required URL/path | Do not execute. Show a toast telling the user to configure the slot. |
| Invalid URL | Inline settings error; if somehow selected, show a toast and do nothing. |
| Path does not exist | Inline settings warning; execution returns failure and shows a toast. |
| `shell.openPath` fails | Show Electron's error message in a short toast or generic fallback text. |
| Unsupported platform action | Show "Not supported on this platform yet." |
| Trigger clash from hand-edited settings | Turn the action trigger off and list the problem in About/settings. |
| Helper crash/restart | Dismiss all open wheels, including action. |
| Action executor throws | Catch, log, and toast failure. Never crash the app. |

## 10. Testing

**Shared TypeScript tests:**
- Action kind validation.
- Default action wheel shape and uniqueness.
- Settings normalization for action trigger, action wheel, invalid params, and trigger clashes.
- URL/path validation helpers.

**Main-process tests:**
- Action executor dispatches the right implementation per kind.
- `openUrl` refuses invalid schemes and accepts http/https.
- `openPath` actions validate required paths and surface errors.
- Copy date/time writes expected text with injected clock/clipboard.
- Unsupported platform returns `unsupported`.

**Overlay/settings tests:**
- Overlay emits `OVERLAY_ACTIONED` on action wheel release.
- Settings action editor applies slot replacements and parameter edits.
- Reset restores the default action wheel.

**Helper tests:**
- Action trigger opens an action wheel.
- Ping, emote, and action triggers are distinct.
- Ambiguous multi-trigger gestures pass through.
- Action wheel cancel paths match ping/emote.

**Manual Windows checklist:**
- Win + drag opens action wheel over Chrome, Explorer, VS Code, and desktop.
- Alt + drag and Ctrl + drag still open the original wheels.
- Screenshot invokes the Windows snipping UI.
- Show desktop, lock screen, mute, volume up/down work.
- Open URL/app/file/folder work.
- Invalid slots show a helpful toast instead of failing silently.

## 11. Out of Scope

- Separate entertainment wheel.
- Arbitrary shell/script actions.
- Multi-step macros.
- Shutdown, restart, log out, delete files, or other destructive operations.
- Custom screenshot capture and save workflow.
- User-imported custom icons.
- Sharing action selections through rooms.
- Refactoring ping/emote into a unified action model.

