# Action Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-first configurable action wheel beside the existing ping and emote wheels.

**Architecture:** Keep ping and emote behavior intact, then add `action` as a third `WheelKind`. Shared code owns action slot normalization, the overlay only renders and reports selected actions, and the main process executes actions through a tested action executor plus the native helper for Windows key chords.

**Tech Stack:** Electron 44, TypeScript, React 19, Fluent UI React v9, Vitest, native C++ hook-helper.

## Global Constraints

- Preserve existing ping wheel and emote wheel behavior.
- Add one action wheel, not a separate entertainment wheel.
- Default action trigger is Win + drag, and it must be user-configurable.
- First milestone is Windows-first; macOS may return unsupported action results.
- Reuse the existing `Wheel` renderer and `WheelEditor` editing pattern.
- Overlay must not execute actions; action execution belongs in the Electron main process.
- Screenshot action invokes the Windows snipping flow, equivalent to Win + Shift + S.
- M1 excludes shutdown, restart, log out, file deletion, arbitrary scripts, multi-step macros, custom screenshot capture, user-imported icons, and room sharing of actions.
- M1 has no action-wheel center-click action; all action execution comes from the 8 slices.

---

## File Structure

Create:
- `src/shared/actions.ts` - action kinds, templates, default 8-slot layout, icon URL helpers, action slot validation and normalization.
- `src/main/actionExecutor.ts` - main-process execution for normalized action slots, with injected dependencies for tests.
- `tests/shared/actions.test.ts` - action model and normalization tests.
- `tests/main/actionExecutor.test.ts` - executor tests with fake Electron/system dependencies.
- `src/renderer/settings/components/ActionSection.tsx` - trigger row, action `WheelEditor`, action pool, and selected-slot parameter editor.
- `assets/actions/*.svg` - app-owned simple action icons for overlay wheel slices.

Modify:
- `src/shared/settings.ts` - add `actionTrigger`, `actionWheel`, trigger clash logic for three wheels, and action fields in `OverlaySettings`.
- `src/shared/protocol.ts` - extend `WheelKind` to include `'action'`, parse action wheel events, and serialize action trigger config plus key-injection command.
- `src/shared/ipc.ts` - add overlay action report channel and settings API path dialog methods.
- `src/shared/settingsChannels.ts` - add path dialog channels.
- `src/shared/i18n.ts` - add action wheel strings in English and Simplified Chinese.
- `src/preload/overlay.ts` - expose `reportAction(id, x, y)`.
- `src/preload/settings.ts` - expose browse dialog calls.
- `src/main/settingsStore.ts` - track action trigger clash problems from hand-edited settings.
- `src/main/settingsIpc.ts` - reject trigger clashes and serve file/folder picker dialogs.
- `src/main/inputBridge.ts` - add a method for key chord injection through the helper.
- `src/main/overlayManager.ts` - route action wheel gestures, receive action reports, and emit `action`.
- `src/main/index.ts` - wire `ActionExecutor`, bridge key injection, action toasts, settings IPC browse dependencies, and About problem text.
- `src/renderer/overlay/main.ts` - create and drive the third `Wheel`.
- `src/renderer/settings/App.tsx` - add nav item and `ActionSection`.
- `src/renderer/settings/settings.css` - style the action parameter editor.
- `native/hook-helper/src/decision.h` and `.cpp` - add `WheelKind::Action`, action trigger config, and three-way gesture ownership.
- `native/hook-helper/src/commands.h` and `.cpp` - parse action trigger and key-injection commands.
- `native/hook-helper/src/output.cpp` - print `"wheel":"action"`.
- `native/hook-helper/src/hooks_win.cpp` - execute key-injection commands via existing `SendInput` path.
- `native/hook-helper/src/simulate.cpp` - surface key-injection commands in simulate mode.
- `native/hook-helper/tests/helper_tests.cpp` - pure helper tests for action trigger and key injection.
- `tests/shared/settings.test.ts`, `tests/shared/protocol.test.ts`, `tests/main/overlayManager.test.ts`, `tests/main/settingsIpc.test.ts`, `tests/helper/protocol.test.ts` - extend existing coverage.

---

### Task 1: Shared Action Model and Settings

**Files:**
- Create: `src/shared/actions.ts`
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/protocol.ts`
- Test: `tests/shared/actions.test.ts`
- Test: `tests/shared/settings.test.ts`
- Test: `tests/shared/protocol.test.ts`

**Interfaces:**
- Produces: `ActionKind`, `ActionSlot`, `ACTION_TEMPLATES`, `DEFAULT_ACTION_WHEEL`, `normalizeActionSlot(raw, index)`, `normalizeActionWheel(raw)`, `actionIconUrl(icon)`.
- Produces: `Settings.actionTrigger`, `Settings.actionWheel`, `OverlaySettings.actionWheel`.
- Produces: `WheelKind = 'ping' | 'emote' | 'action'`.
- Consumed later by: overlay, settings UI, `OverlayManager`, and `ActionExecutor`.

- [ ] **Step 1: Write action model tests**

Create `tests/shared/actions.test.ts` with these tests:

```ts
import { describe, expect, it } from 'vitest';
import {
  ACTION_TEMPLATES, DEFAULT_ACTION_WHEEL, actionIconUrl, normalizeActionSlot, normalizeActionWheel,
} from '../../src/shared/actions';

describe('action model', () => {
  it('ships the default 8-slot action wheel', () => {
    expect(DEFAULT_ACTION_WHEEL.map((a) => a.kind)).toEqual([
      'screenshot', 'muteToggle', 'showDesktop', 'lockScreen',
      'openBrowser', 'openUrl', 'openApp', 'openFolder',
    ]);
    expect(new Set(DEFAULT_ACTION_WHEEL.map((a) => a.id)).size).toBe(8);
  });

  it('offers more action templates than the default wheel', () => {
    expect(ACTION_TEMPLATES.map((a) => a.kind)).toEqual([
      'screenshot', 'showDesktop', 'lockScreen', 'muteToggle', 'volumeUp', 'volumeDown',
      'openBrowser', 'openUrl', 'openApp', 'openFile', 'openFolder',
      'openDownloads', 'openDesktop', 'openHome', 'copyDate', 'copyTime',
    ]);
  });

  it('normalizes a parameterized URL action', () => {
    expect(normalizeActionSlot({
      id: 'site',
      kind: 'openUrl',
      label: 'Docs',
      icon: 'web',
      params: { url: 'https://example.com', path: 'C:/ignored' },
      extra: true,
    }, 2)).toEqual({
      id: 'site',
      kind: 'openUrl',
      label: 'Docs',
      icon: 'web',
      params: { url: 'https://example.com' },
    });
  });

  it('falls back invalid slots by position and repairs duplicate ids', () => {
    const wheel = normalizeActionWheel([
      { id: 'same', kind: 'screenshot', label: 'Shot', icon: 'screenshot' },
      { id: 'same', kind: 'openUrl', label: '', icon: 'web', params: { url: 7 } },
      { kind: 'missing' },
    ]);
    expect(wheel).toHaveLength(8);
    expect(new Set(wheel.map((a) => a.id)).size).toBe(8);
    expect(wheel[0]).toMatchObject({ kind: 'screenshot', label: 'Shot' });
    expect(wheel[1]).toMatchObject({ kind: 'openUrl', label: 'Open website', params: {} });
    expect(wheel[2]).toMatchObject(DEFAULT_ACTION_WHEEL[2]);
  });

  it('builds overlay icon urls', () => {
    expect(actionIconUrl('screenshot')).toBe('../actions/screenshot.svg');
  });
});
```

- [ ] **Step 2: Run action model tests to verify they fail**

Run: `npx vitest run tests/shared/actions.test.ts`

Expected: FAIL with an import error for `../../src/shared/actions`.

- [ ] **Step 3: Add the shared action model**

Create `src/shared/actions.ts` with this structure:

```ts
export type ActionKind =
  | 'screenshot' | 'showDesktop' | 'lockScreen' | 'muteToggle' | 'volumeUp' | 'volumeDown'
  | 'openBrowser' | 'openUrl' | 'openApp' | 'openFile' | 'openFolder'
  | 'openDownloads' | 'openDesktop' | 'openHome' | 'copyDate' | 'copyTime';

export type ActionIcon =
  | 'screenshot' | 'desktop' | 'lock' | 'mute' | 'volume-up' | 'volume-down'
  | 'browser' | 'web' | 'app' | 'file' | 'folder' | 'downloads' | 'home' | 'calendar' | 'clock';

export interface ActionSlot {
  id: string;
  kind: ActionKind;
  label: string;
  icon: ActionIcon;
  params?: {
    url?: string;
    path?: string;
  };
}

export const ACTION_TEMPLATES: readonly ActionSlot[] = [
  { id: 'tpl-screenshot', kind: 'screenshot', label: 'Screenshot', icon: 'screenshot' },
  { id: 'tpl-showDesktop', kind: 'showDesktop', label: 'Show desktop', icon: 'desktop' },
  { id: 'tpl-lockScreen', kind: 'lockScreen', label: 'Lock screen', icon: 'lock' },
  { id: 'tpl-muteToggle', kind: 'muteToggle', label: 'Mute/unmute', icon: 'mute' },
  { id: 'tpl-volumeUp', kind: 'volumeUp', label: 'Volume up', icon: 'volume-up' },
  { id: 'tpl-volumeDown', kind: 'volumeDown', label: 'Volume down', icon: 'volume-down' },
  { id: 'tpl-openBrowser', kind: 'openBrowser', label: 'Open browser', icon: 'browser' },
  { id: 'tpl-openUrl', kind: 'openUrl', label: 'Open website', icon: 'web', params: {} },
  { id: 'tpl-openApp', kind: 'openApp', label: 'Open app', icon: 'app', params: {} },
  { id: 'tpl-openFile', kind: 'openFile', label: 'Open file', icon: 'file', params: {} },
  { id: 'tpl-openFolder', kind: 'openFolder', label: 'Open folder', icon: 'folder', params: {} },
  { id: 'tpl-openDownloads', kind: 'openDownloads', label: 'Open Downloads', icon: 'downloads' },
  { id: 'tpl-openDesktop', kind: 'openDesktop', label: 'Open Desktop', icon: 'desktop' },
  { id: 'tpl-openHome', kind: 'openHome', label: 'Open Home', icon: 'home' },
  { id: 'tpl-copyDate', kind: 'copyDate', label: 'Copy date', icon: 'calendar' },
  { id: 'tpl-copyTime', kind: 'copyTime', label: 'Copy time', icon: 'clock' },
];

export const DEFAULT_ACTION_WHEEL: readonly ActionSlot[] = [
  { ...ACTION_TEMPLATES[0], id: 'action-0-screenshot' },
  { ...ACTION_TEMPLATES[3], id: 'action-1-muteToggle' },
  { ...ACTION_TEMPLATES[1], id: 'action-2-showDesktop' },
  { ...ACTION_TEMPLATES[2], id: 'action-3-lockScreen' },
  { ...ACTION_TEMPLATES[6], id: 'action-4-openBrowser' },
  { ...ACTION_TEMPLATES[7], id: 'action-5-openUrl' },
  { ...ACTION_TEMPLATES[8], id: 'action-6-openApp' },
  { ...ACTION_TEMPLATES[10], id: 'action-7-openFolder' },
];

const KINDS = new Set<ActionKind>(ACTION_TEMPLATES.map((a) => a.kind));
const ICONS = new Set<ActionIcon>(ACTION_TEMPLATES.map((a) => a.icon));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const cleanText = (v: unknown, fallback: string): string => {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return s.length > 0 ? s.slice(0, 40) : fallback;
};

export const isActionKind = (v: unknown): v is ActionKind => typeof v === 'string' && KINDS.has(v as ActionKind);
export const actionIconUrl = (icon: ActionIcon): string => `../actions/${icon}.svg`;
export const actionTemplate = (kind: ActionKind): ActionSlot => ACTION_TEMPLATES.find((a) => a.kind === kind) as ActionSlot;

export function normalizeActionSlot(raw: unknown, index: number): ActionSlot {
  const fallback = DEFAULT_ACTION_WHEEL[index] ?? DEFAULT_ACTION_WHEEL[0];
  if (!isObj(raw) || !isActionKind(raw.kind)) return { ...fallback, params: fallback.params ? { ...fallback.params } : undefined };
  const template = actionTemplate(raw.kind);
  const icon = typeof raw.icon === 'string' && ICONS.has(raw.icon as ActionIcon) ? (raw.icon as ActionIcon) : template.icon;
  const params = isObj(raw.params) ? raw.params : {};
  const slot: ActionSlot = {
    id: cleanText(raw.id, `action-${index}-${raw.kind}`),
    kind: raw.kind,
    label: cleanText(raw.label, template.label),
    icon,
  };
  if (raw.kind === 'openUrl') slot.params = typeof params.url === 'string' ? { url: params.url.trim() } : {};
  if (raw.kind === 'openApp' || raw.kind === 'openFile' || raw.kind === 'openFolder') {
    slot.params = typeof params.path === 'string' ? { path: params.path.trim() } : {};
  }
  return slot;
}

export function normalizeActionWheel(raw: unknown): ActionSlot[] {
  const source = Array.isArray(raw) ? raw : DEFAULT_ACTION_WHEEL;
  const out = Array.from({ length: 8 }, (_, i) => normalizeActionSlot(source[i], i));
  const seen = new Set<string>();
  return out.map((slot, i) => {
    if (!seen.has(slot.id)) {
      seen.add(slot.id);
      return slot;
    }
    const fixed = { ...slot, id: `action-${i}-${slot.kind}` };
    seen.add(fixed.id);
    return fixed;
  });
}
```

- [ ] **Step 4: Run action model tests to verify they pass**

Run: `npx vitest run tests/shared/actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Extend settings tests**

Append these tests to `tests/shared/settings.test.ts`:

```ts
describe('action wheel settings', () => {
  it('defaults to Win and carries the default action wheel', () => {
    const s = normalizeSettings(undefined);
    expect(s.actionTrigger).toBe('win');
    expect(s.actionWheel.map((a) => a.kind)).toEqual([
      'screenshot', 'muteToggle', 'showDesktop', 'lockScreen',
      'openBrowser', 'openUrl', 'openApp', 'openFolder',
    ]);
  });

  it('turns off an action trigger that clashes with ping or emote', () => {
    expect(normalizeSettings({ actionTrigger: 'alt' }).actionTrigger).toBe('off');
    expect(normalizeSettings({ actionTrigger: 'ctrl' }).actionTrigger).toBe('off');
    expect(normalizeSettings({ trigger: 'shift', emoteTrigger: 'ctrl', actionTrigger: 'win' }).actionTrigger).toBe('win');
  });

  it('patchClashes rejects any three-wheel trigger collision', () => {
    const current = normalizeSettings(undefined);
    expect(patchClashes(current, { actionTrigger: 'alt' })).toBe(true);
    expect(patchClashes(current, { actionTrigger: 'shift' })).toBe(false);
    expect(patchClashes(current, { trigger: 'shift', actionTrigger: 'alt' })).toBe(false);
  });

  it('overlaySettings carries action slots as copies', () => {
    const s = normalizeSettings(undefined);
    const o = overlaySettings(s);
    expect(o.actionWheel).toEqual(s.actionWheel);
    expect(o.actionWheel).not.toBe(s.actionWheel);
    expect(o.actionWheel[0]).not.toBe(s.actionWheel[0]);
  });
});
```

- [ ] **Step 6: Run settings tests to verify they fail**

Run: `npx vitest run tests/shared/settings.test.ts`

Expected: FAIL with missing `actionTrigger` or missing `actionWheel`.

- [ ] **Step 7: Implement action settings**

Modify `src/shared/settings.ts`:

```ts
import { DEFAULT_ACTION_WHEEL, normalizeActionWheel, type ActionSlot } from './actions';
```

Add:

```ts
export type OptionalTriggerKey = TriggerKey | 'off';
export type EmoteTriggerKey = OptionalTriggerKey;
export type ActionTriggerKey = OptionalTriggerKey;
```

Add to `Settings`:

```ts
actionTrigger: ActionTriggerKey;
actionWheel: ActionSlot[];
```

Add to `DEFAULT_SETTINGS`:

```ts
actionTrigger: 'win',
actionWheel: DEFAULT_ACTION_WHEEL.map((a) => ({ ...a, params: a.params ? { ...a.params } : undefined })),
```

Replace the two-trigger clash helper with a three-trigger helper while keeping the old export available:

```ts
export function triggersClash(ping: TriggerKey, emote: EmoteTriggerKey, toggle: Hotkey): boolean {
  if (emote === 'off') return false;
  const vk = triggerVk(emote);
  return sameTrigger(ping, emote) || (vk !== null && vk === toggle.vk);
}

export function wheelTriggersClash(ping: TriggerKey, emote: EmoteTriggerKey, action: ActionTriggerKey, toggle: Hotkey): boolean {
  const enabled = [ping, emote, action].filter((t): t is TriggerKey => t !== 'off');
  for (let i = 0; i < enabled.length; i += 1) {
    for (let j = i + 1; j < enabled.length; j += 1) if (sameTrigger(enabled[i], enabled[j])) return true;
  }
  return enabled.some((t) => {
    const vk = triggerVk(t);
    return vk !== null && vk === toggle.vk;
  });
}
```

In `normalizeSettings`, parse `actionTrigger` with the same `emoteKey()` helper, then turn it off if `wheelTriggersClash(...)` is true. Keep the emote normalization behavior compatible by only turning emote off when its own two-trigger rule fails.

Leave `rendererPatch` unchanged because `actionWheel` and `actionTrigger` can flow through the existing patch path.

Extend `OverlaySettings`:

```ts
export type OverlaySettings = Pick<
  Settings,
  'pingSizePx' | 'pingDurationS' | 'volume' | 'muted' | 'tickSound' | 'wheel' | 'clickPingId'
  | 'emoteWheel' | 'clickEmoteId' | 'emoteSizePx' | 'emoteSound' | 'customEmotes'
  | 'actionWheel'
>;
```

Copy action slots in `overlaySettings`:

```ts
actionWheel: s.actionWheel.map((a) => ({ ...a, params: a.params ? { ...a.params } : undefined })),
```

- [ ] **Step 8: Run settings tests to verify they pass**

Run: `npx vitest run tests/shared/settings.test.ts`

Expected: PASS.

- [ ] **Step 9: Extend protocol tests**

In `tests/shared/protocol.test.ts`, update the wheel test:

```ts
expect(parseHelperLine('{"type":"wheelOpen","x":1,"y":2,"wheel":"action"}')).toEqual({ type: 'wheelOpen', x: 1, y: 2, wheel: 'action' });
```

Update the default config expectation:

```ts
expect(configCommand(DEFAULT_SETTINGS, true)).toMatchObject({
  actionTrigger: 'win',
  actionTriggerVk: 0,
});
```

Add a key injection serialization test:

```ts
it('serializes helper key injection commands', () => {
  expect(serializeCommand({ type: 'injectKeys', keys: [0x5b, 0x10, 0x53] }))
    .toBe('{"type":"injectKeys","keys":"91,16,83"}\n');
});
```

- [ ] **Step 10: Run protocol tests to verify they fail**

Run: `npx vitest run tests/shared/protocol.test.ts`

Expected: FAIL because `WheelKind` does not accept `action` and `injectKeys` is not implemented.

- [ ] **Step 11: Implement shared protocol changes**

Modify `src/shared/protocol.ts`:

```ts
export type WheelKind = 'ping' | 'emote' | 'action';
```

In `parseHelperLine`, map point event wheel values:

```ts
const wheel = o.wheel === 'emote' || o.wheel === 'action' ? o.wheel : 'ping';
return { type: o.type as PointType, x: o.x, y: o.y, wheel };
```

Extend `HelperCommand` config:

```ts
actionTrigger: HelperTrigger | 'off';
actionTriggerVk: number;
```

Add command:

```ts
| { type: 'injectKeys'; keys: number[] }
```

Extend `configCommand`:

```ts
const a = s.actionTrigger;
actionTrigger: typeof a === 'object' ? 'vk' : a,
actionTriggerVk: typeof a === 'object' ? a.vk : 0,
```

Replace `serializeCommand` with:

```ts
export function serializeCommand(c: HelperCommand): string {
  if (c.type === 'injectKeys') return `${JSON.stringify({ type: 'injectKeys', keys: c.keys.join(',') })}\n`;
  return `${JSON.stringify(c)}\n`;
}
```

- [ ] **Step 12: Run Task 1 tests**

Run:

```powershell
npx vitest run tests/shared/actions.test.ts tests/shared/settings.test.ts tests/shared/protocol.test.ts
```

Expected: PASS.

- [ ] **Step 13: Commit Task 1**

```powershell
git add src/shared/actions.ts src/shared/settings.ts src/shared/protocol.ts tests/shared/actions.test.ts tests/shared/settings.test.ts tests/shared/protocol.test.ts
git commit -m "Add shared action wheel settings"
```

---

### Task 2: Native Helper Action Wheel and Key Injection

**Files:**
- Modify: `native/hook-helper/src/decision.h`
- Modify: `native/hook-helper/src/decision.cpp`
- Modify: `native/hook-helper/src/commands.h`
- Modify: `native/hook-helper/src/commands.cpp`
- Modify: `native/hook-helper/src/output.cpp`
- Modify: `native/hook-helper/src/hooks_win.cpp`
- Modify: `native/hook-helper/src/simulate.cpp`
- Test: `native/hook-helper/tests/helper_tests.cpp`
- Test: `tests/helper/protocol.test.ts`

**Interfaces:**
- Consumes: shared `HelperCommand` fields `actionTrigger`, `actionTriggerVk`, and `{ type: 'injectKeys'; keys: '...' }`.
- Produces: helper events with `"wheel":"action"`.
- Produces: helper-side key chord injection for screenshot, show desktop, mute, and volume actions.

- [ ] **Step 1: Add C++ pure decision tests**

In `native/hook-helper/tests/helper_tests.cpp`, add `WIN = 0x5B` near the key constants:

```cpp
constexpr uint32_t ALT = 0xA4, CTRL = 0xA2, WIN = 0x5B, KEY_P = 0x50, ESC = 0x1B, CAPS = 0x14, KEY_V = 0x56, KEY_T = 0x54;
```

Add helper:

```cpp
Decision withAction(Trigger action = Trigger::Win, uint32_t vk = 0) {
  Config c;
  c.emoteTrigger = Trigger::Ctrl;
  c.actionTrigger = action;
  c.actionTriggerVk = vk;
  Decision d;
  d.setConfig(c);
  return d;
}
```

Add tests:

```cpp
static void test_win_drag_opens_action_wheel() {
  Decision d = withAction();
  CHECK(!d.onEvent(kd(WIN)).swallow);
  CHECK(d.onEvent(md(Btn::Left, 100, 100)).swallow);
  Result r = d.onEvent(mv(130, 100));
  CHECK(emitIs(findEmit(r, Emit::Kind::WheelOpen), WheelKind::Action));
  CHECK(emitIs(findEmit(r, Emit::Kind::WheelMove), WheelKind::Action));
  r = d.onEvent(mu(Btn::Left, 140, 90));
  CHECK(r.swallow);
  CHECK(emitIs(findEmit(r, Emit::Kind::WheelRelease), WheelKind::Action));
}

static void test_three_triggers_held_pass_through() {
  Decision d = withAction();
  d.onEvent(kd(ALT));
  d.onEvent(kd(CTRL));
  d.onEvent(kd(WIN));
  Result r = d.onEvent(md(Btn::Left, 100, 100));
  CHECK(!r.swallow && r.emits.empty() && r.injects.empty());
}

static void test_action_trigger_none_ignores_win_drag() {
  Decision d = withAction(Trigger::None);
  d.onEvent(kd(WIN));
  CHECK(!d.onEvent(md(Btn::Left, 100, 100)).swallow);
  CHECK(d.onEvent(mv(150, 100)).emits.empty());
  CHECK(!d.onEvent(mu(Btn::Left, 150, 100)).swallow);
}

static void test_parse_config_action_fields_and_inject_keys() {
  const Config cur;
  Command c = parseCommand(R"({"type":"config","actionTrigger":"win","actionTriggerVk":0})", cur);
  CHECK(c.kind == Command::Kind::Config && c.config.actionTrigger == Trigger::Win);
  c = parseCommand(R"({"type":"config","actionTrigger":"off"})", cur);
  CHECK(c.kind == Command::Kind::Config && c.config.actionTrigger == Trigger::None);
  c = parseCommand(R"({"type":"injectKeys","keys":"91,16,83"})", cur);
  CHECK(c.kind == Command::Kind::InjectKeys);
  CHECK(c.injects.size() == 6);
  CHECK(injectIs(c.injects[0], InjectKind::KeyDown, Btn::None, 91));
  CHECK(injectIs(c.injects[2], InjectKind::KeyDown, Btn::None, 83));
  CHECK(injectIs(c.injects[3], InjectKind::KeyUp, Btn::None, 83));
  CHECK(injectIs(c.injects[5], InjectKind::KeyUp, Btn::None, 91));
}
```

Call those tests in `main()`.

- [ ] **Step 2: Run helper tests to verify they fail**

Run: `npm run test:helper`

Expected: FAIL with missing `WheelKind::Action`, `Config.actionTrigger`, or `Command::Kind::InjectKeys`.

- [ ] **Step 3: Implement helper action trigger data**

In `native/hook-helper/src/decision.h`:

```cpp
enum class WheelKind { Ping, Emote, Action };
```

Add to `Config`:

```cpp
Trigger actionTrigger = Trigger::Win;
uint32_t actionTriggerVk = 0;
```

In `Decision::spec` in `decision.cpp`:

```cpp
if (k == WheelKind::Action) return {cfg_.actionTrigger, cfg_.actionTriggerVk, false};
if (k == WheelKind::Emote) return {cfg_.emoteTrigger, cfg_.emoteTriggerVk, cfg_.emoteClick};
return {cfg_.trigger, cfg_.triggerVk, cfg_.clickPing};
```

Update key-trigger swallowing:

```cpp
if (ownKey(WheelKind::Ping) || ownKey(WheelKind::Emote) || ownKey(WheelKind::Action)) {
```

Update gesture ownership in `onMouseDown`:

```cpp
const bool ping = startsGesture(WheelKind::Ping, e.btn);
const bool emote = startsGesture(WheelKind::Emote, e.btn);
const bool action = startsGesture(WheelKind::Action, e.btn);
const int claims = (ping ? 1 : 0) + (emote ? 1 : 0) + (action ? 1 : 0);
if (claims == 1) {
  r.swallow = true;
  markSwallow();
  state_ = State::Pending;
  owner_ = ping ? WheelKind::Ping : emote ? WheelKind::Emote : WheelKind::Action;
  dragBtn_ = e.btn;
  px_ = e.x;
  py_ = e.y;
}
```

- [ ] **Step 4: Implement helper command parsing**

In `commands.h`, add:

```cpp
enum class Kind { Invalid, Config, SetEnabled, Suspend, Shutdown, SimEvent, SimTick, InjectKeys } kind = Kind::Invalid;
std::vector<Inject> injects;  // InjectKeys
```

In `commands.cpp`, parse action fields in config:

```cpp
if (m.count("actionTrigger") != 0 && !parseEmoteTrigger(m["actionTrigger"], cfg.actionTrigger)) return c;
cfg.actionTriggerVk = static_cast<uint32_t>(getInt(m, "actionTriggerVk", cfg.actionTriggerVk));
```

Add a parser for comma-separated key chords:

```cpp
std::vector<uint32_t> parseKeys(const std::string& raw) {
  std::vector<uint32_t> out;
  size_t start = 0;
  while (start < raw.size()) {
    const size_t comma = raw.find(',', start);
    const std::string part = raw.substr(start, comma == std::string::npos ? std::string::npos : comma - start);
    const long long vk = getInt({{"v", part}}, "v", 0);
    if (vk < 1 || vk > 254) return {};
    out.push_back(static_cast<uint32_t>(vk));
    if (comma == std::string::npos) break;
    start = comma + 1;
  }
  return out;
}
```

Handle `injectKeys`:

```cpp
} else if (type == "injectKeys") {
  const auto keys = parseKeys(getStr(m, "keys"));
  if (keys.empty() || keys.size() > 6) return c;
  c.kind = Command::Kind::InjectKeys;
  for (uint32_t vk : keys) c.injects.push_back({InjectKind::KeyDown, Btn::None, vk});
  for (auto it = keys.rbegin(); it != keys.rend(); ++it) c.injects.push_back({InjectKind::KeyUp, Btn::None, *it});
```

- [ ] **Step 5: Implement helper output and injection execution**

In `output.cpp`, update wheel formatting:

```cpp
const char* wheel = e.wheel == WheelKind::Action ? "action" : e.wheel == WheelKind::Emote ? "emote" : "ping";
return std::string("{\"type\":\"") + type + "\",\"x\":" + std::to_string(e.x) + ",\"y\":" + std::to_string(e.y) +
       ",\"wheel\":\"" + wheel + "\"}";
```

In `hooks_win.cpp`, handle the new command:

```cpp
case Command::Kind::InjectKeys: sendInjects(c.injects); break;
```

In `simulate.cpp`, report the injection:

```cpp
case Command::Kind::InjectKeys: {
  Result r;
  r.injects = c.injects;
  report(out, r, true);
  break;
}
```

- [ ] **Step 6: Run helper tests to verify they pass**

Run: `npm run test:helper`

Expected: PASS.

- [ ] **Step 7: Extend integration protocol test**

In `tests/helper/protocol.test.ts`, update `config`:

```ts
const WIN = 91;
const config = {
  type: 'config', trigger: 'alt', triggerVk: 0, clickPing: false,
  emoteTrigger: 'ctrl', emoteTriggerVk: 0, emoteClick: false,
  actionTrigger: 'win', actionTriggerVk: 0,
  dragThresholdPx: 8, toggleMods: 3, toggleVk: 80, enabled: true,
};
```

Add tests:

```ts
it('opens and releases the action wheel on Win+drag', async () => {
  const events = await simulate([
    config,
    sim('kdown', { vk: WIN }),
    sim('mdown', { btn: 'left', x: 100, y: 100 }),
    sim('move', { x: 130, y: 100 }),
    sim('mup', { btn: 'left', x: 140, y: 90 }),
  ]);
  expect(events.filter((e) => e.type !== 'sim' && e.type !== 'ready')).toEqual([
    { type: 'wheelOpen', x: 100, y: 100, wheel: 'action' },
    { type: 'wheelMove', x: 130, y: 100, wheel: 'action' },
    { type: 'wheelRelease', x: 140, y: 90, wheel: 'action' },
  ]);
});

it('injects key chords through the helper', async () => {
  const events = await simulate([{ type: 'injectKeys', keys: '91,16,83' }]);
  expect(events.at(-1)).toEqual({ type: 'sim', swallow: false, inject: 'kdown:91,kdown:16,kdown:83,kup:83,kup:16,kup:91' });
});
```

- [ ] **Step 8: Build helper and run integration test**

Run:

```powershell
npm run build:helper
npx vitest run tests/helper/protocol.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```powershell
git add native/hook-helper/src native/hook-helper/tests/helper_tests.cpp tests/helper/protocol.test.ts
git commit -m "Add action wheel support to helper"
```

---

### Task 3: Main-Process Action Execution and Overlay Routing

**Files:**
- Create: `src/main/actionExecutor.ts`
- Modify: `src/main/inputBridge.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/overlay.ts`
- Modify: `src/main/overlayManager.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/actionExecutor.test.ts`
- Test: `tests/main/overlayManager.test.ts`
- Test: `tests/main/inputBridge.test.ts`

**Interfaces:**
- Consumes: `ActionSlot` from `src/shared/actions.ts`.
- Produces: `executeAction(slot, deps): Promise<ActionResult>`.
- Produces: `InputBridge.injectKeys(keys: number[]): void`.
- Produces: overlay-to-main channel `OVERLAY_ACTIONED` carrying `{ id, x, y }`.
- Produces: `OverlayManager` event `'action'` with `{ id, displayId, x, y }`.

- [ ] **Step 1: Write action executor tests**

Create `tests/main/actionExecutor.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAction, type ActionExecutorDeps } from '../../src/main/actionExecutor';
import type { ActionSlot } from '../../src/shared/actions';

const slot = (kind: ActionSlot['kind'], params?: ActionSlot['params']): ActionSlot =>
  ({ id: `id-${kind}`, kind, label: kind, icon: 'app', params } as ActionSlot);

let deps: ActionExecutorDeps;
beforeEach(() => {
  deps = {
    platform: 'win',
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
    run: vi.fn(async () => undefined),
    writeClipboard: vi.fn(),
    injectKeys: vi.fn(),
    exists: vi.fn(() => true),
    now: () => new Date('2026-10-10T08:09:00Z'),
    paths: { home: 'C:\\Users\\me', desktop: 'C:\\Users\\me\\Desktop', downloads: 'C:\\Users\\me\\Downloads' },
  };
});

describe('executeAction', () => {
  it('opens http and https urls only', async () => {
    await expect(executeAction(slot('openUrl', { url: 'https://example.com' }), deps)).resolves.toEqual({ ok: true });
    expect(deps.openExternal).toHaveBeenCalledWith('https://example.com/');
    await expect(executeAction(slot('openUrl', { url: 'file:///C:/Windows/System32/calc.exe' }), deps))
      .resolves.toEqual({ ok: false, reason: 'invalidUrl' });
  });

  it('reports missing config for parameterized actions', async () => {
    await expect(executeAction(slot('openApp'), deps)).resolves.toEqual({ ok: false, reason: 'missingConfig' });
    await expect(executeAction(slot('openFolder', { path: '   ' }), deps)).resolves.toEqual({ ok: false, reason: 'missingConfig' });
  });

  it('opens existing app file and folder paths', async () => {
    await executeAction(slot('openApp', { path: 'C:\\Tools\\app.exe' }), deps);
    await executeAction(slot('openFile', { path: 'C:\\Docs\\note.txt' }), deps);
    await executeAction(slot('openFolder', { path: 'C:\\Docs' }), deps);
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Tools\\app.exe');
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Docs\\note.txt');
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Docs');
  });

  it('surfaces shell.openPath errors', async () => {
    deps.openPath = vi.fn(async () => 'Access denied');
    await expect(executeAction(slot('openFile', { path: 'C:\\secret.txt' }), deps))
      .resolves.toEqual({ ok: false, reason: 'openFailed', message: 'Access denied' });
  });

  it('injects Windows shortcut keys for desktop operations', async () => {
    await executeAction(slot('screenshot'), deps);
    await executeAction(slot('showDesktop'), deps);
    await executeAction(slot('muteToggle'), deps);
    await executeAction(slot('volumeUp'), deps);
    await executeAction(slot('volumeDown'), deps);
    expect(deps.injectKeys).toHaveBeenCalledWith([0x5b, 0x10, 0x53]);
    expect(deps.injectKeys).toHaveBeenCalledWith([0x5b, 0x44]);
    expect(deps.injectKeys).toHaveBeenCalledWith([0xad]);
    expect(deps.injectKeys).toHaveBeenCalledWith([0xaf]);
    expect(deps.injectKeys).toHaveBeenCalledWith([0xae]);
  });

  it('locks the workstation on Windows', async () => {
    await expect(executeAction(slot('lockScreen'), deps)).resolves.toEqual({ ok: true });
    expect(deps.run).toHaveBeenCalledWith('rundll32.exe', ['user32.dll,LockWorkStation']);
  });

  it('opens known user folders', async () => {
    await executeAction(slot('openDownloads'), deps);
    await executeAction(slot('openDesktop'), deps);
    await executeAction(slot('openHome'), deps);
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Users\\me\\Downloads');
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Users\\me\\Desktop');
    expect(deps.openPath).toHaveBeenCalledWith('C:\\Users\\me');
  });

  it('copies date and time', async () => {
    await executeAction(slot('copyDate'), deps);
    await executeAction(slot('copyTime'), deps);
    expect(deps.writeClipboard).toHaveBeenCalledWith('2026-10-10');
    expect(deps.writeClipboard).toHaveBeenCalledWith('08:09');
  });

  it('returns unsupported for Windows-only actions on macOS', async () => {
    deps.platform = 'mac';
    await expect(executeAction(slot('screenshot'), deps)).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });
});
```

- [ ] **Step 2: Run action executor tests to verify they fail**

Run: `npx vitest run tests/main/actionExecutor.test.ts`

Expected: FAIL with an import error for `../../src/main/actionExecutor`.

- [ ] **Step 3: Implement action executor**

Create `src/main/actionExecutor.ts`:

```ts
import type { ActionSlot } from '../shared/actions';
import type { Platform } from '../shared/platform';

export type ActionFailureReason = 'missingConfig' | 'invalidUrl' | 'pathMissing' | 'openFailed' | 'unsupported';
export type ActionResult = { ok: true } | { ok: false; reason: ActionFailureReason; message?: string };

export interface ActionExecutorDeps {
  platform: Platform;
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  run(command: string, args: string[]): Promise<void>;
  writeClipboard(text: string): void;
  injectKeys(keys: number[]): void;
  exists(path: string): boolean;
  now(): Date;
  paths: { home: string; desktop: string; downloads: string };
}

const pathParam = (slot: ActionSlot): string | null => {
  const path = slot.params?.path?.trim();
  return path ? path : null;
};

const urlParam = (slot: ActionSlot): string | null => {
  const raw = slot.params?.url?.trim();
  return raw ? raw : null;
};

function webUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

async function openPath(path: string, deps: ActionExecutorDeps): Promise<ActionResult> {
  if (!deps.exists(path)) return { ok: false, reason: 'pathMissing' };
  const error = await deps.openPath(path);
  return error ? { ok: false, reason: 'openFailed', message: error } : { ok: true };
}

const ymd = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export async function executeAction(slot: ActionSlot, deps: ActionExecutorDeps): Promise<ActionResult> {
  const windowsOnly = ['screenshot', 'showDesktop', 'lockScreen', 'muteToggle', 'volumeUp', 'volumeDown'];
  if (deps.platform !== 'win' && windowsOnly.includes(slot.kind)) return { ok: false, reason: 'unsupported' };
  switch (slot.kind) {
    case 'screenshot':
      deps.injectKeys([0x5b, 0x10, 0x53]);
      return { ok: true };
    case 'showDesktop':
      deps.injectKeys([0x5b, 0x44]);
      return { ok: true };
    case 'lockScreen':
      await deps.run('rundll32.exe', ['user32.dll,LockWorkStation']);
      return { ok: true };
    case 'muteToggle':
      deps.injectKeys([0xad]);
      return { ok: true };
    case 'volumeUp':
      deps.injectKeys([0xaf]);
      return { ok: true };
    case 'volumeDown':
      deps.injectKeys([0xae]);
      return { ok: true };
    case 'openBrowser':
      await deps.openExternal('https://www.google.com/');
      return { ok: true };
    case 'openUrl': {
      const raw = urlParam(slot);
      if (!raw) return { ok: false, reason: 'missingConfig' };
      const url = webUrl(raw);
      if (!url) return { ok: false, reason: 'invalidUrl' };
      await deps.openExternal(url);
      return { ok: true };
    }
    case 'openApp':
    case 'openFile':
    case 'openFolder': {
      const path = pathParam(slot);
      return path ? openPath(path, deps) : { ok: false, reason: 'missingConfig' };
    }
    case 'openDownloads':
      return openPath(deps.paths.downloads, deps);
    case 'openDesktop':
      return openPath(deps.paths.desktop, deps);
    case 'openHome':
      return openPath(deps.paths.home, deps);
    case 'copyDate':
      deps.writeClipboard(ymd(deps.now()));
      return { ok: true };
    case 'copyTime':
      deps.writeClipboard(hm(deps.now()));
      return { ok: true };
  }
}
```

- [ ] **Step 4: Run action executor tests to verify they pass**

Run: `npx vitest run tests/main/actionExecutor.test.ts`

Expected: PASS.

- [ ] **Step 5: Extend InputBridge tests**

In `tests/main/inputBridge.test.ts`, update config literals with action fields:

```ts
actionTrigger: 'win', actionTriggerVk: 0,
```

Add:

```ts
it('sends helper key injection commands', async () => {
  const b = bridge('echo');
  const running = waitFor<string>(b, 'status', (s) => s === 'running');
  b.start();
  await running;
  const echoed = waitFor<HelperEvent>(b, 'event', (e) => e.type === 'error' && e.message === 'got:injectKeys');
  b.injectKeys([0x5b, 0x10, 0x53]);
  await echoed;
});
```

- [ ] **Step 6: Run InputBridge test to verify it fails**

Run: `npx vitest run tests/main/inputBridge.test.ts`

Expected: FAIL because `injectKeys` is not defined.

- [ ] **Step 7: Implement InputBridge injection**

Modify `src/main/inputBridge.ts`:

```ts
injectKeys(keys: number[]): void {
  const valid = keys.filter((k) => Number.isInteger(k) && k >= 1 && k <= 254);
  if (valid.length === keys.length && valid.length > 0 && valid.length <= 6) this.write({ type: 'injectKeys', keys: valid });
}
```

- [ ] **Step 8: Run InputBridge tests to verify they pass**

Run: `npx vitest run tests/main/inputBridge.test.ts`

Expected: PASS.

- [ ] **Step 9: Add overlay action IPC tests**

In `tests/main/overlayManager.test.ts`, import `OVERLAY_ACTIONED` and add:

```ts
it('forwards action wheel events and emits action reports', () => {
  const action = vi.fn();
  mgr.on('action', action);
  mgr.handle({ type: 'wheelOpen', x: 100, y: 200, wheel: 'action' });
  mgr.handle({ type: 'wheelMove', x: 110, y: 210, wheel: 'action' });
  mgr.handle({ type: 'wheelRelease', x: 120, y: 220, wheel: 'action' });
  expect(sent(0)).toEqual([
    ['wheel:open', { x: 100, y: 200, wheel: 'action' }],
    ['wheel:move', { x: 110, y: 210, wheel: 'action' }],
    ['wheel:release', { x: 120, y: 220, wheel: 'action' }],
  ]);
  h.handlers.get(OVERLAY_ACTIONED)!({ sender: sender(0) }, { id: 'action-0-screenshot', x: 10, y: 20 });
  expect(action).toHaveBeenCalledWith({ id: 'action-0-screenshot', displayId: 1, x: 10, y: 20 });
});
```

Also add malformed report cases:

```ts
it('ignores malformed action reports', () => {
  const action = vi.fn();
  mgr.on('action', action);
  const report = h.handlers.get(OVERLAY_ACTIONED)!;
  for (const raw of [null, {}, { id: '', x: 1, y: 2 }, { id: 'a', x: '1', y: 2 }, { id: 'a', x: 1, y: NaN }]) {
    report({ sender: sender(0) }, raw);
  }
  expect(action).not.toHaveBeenCalled();
});
```

- [ ] **Step 10: Run overlay manager test to verify it fails**

Run: `npx vitest run tests/main/overlayManager.test.ts`

Expected: FAIL because `OVERLAY_ACTIONED` and action report handling do not exist.

- [ ] **Step 11: Implement overlay action IPC and manager routing**

In `src/shared/ipc.ts`, add:

```ts
export const OVERLAY_ACTIONED = 'overlay:actioned';
```

In `src/preload/overlay.ts`, import it and expose:

```ts
reportAction(id: string, x: number, y: number): void {
  ipcRenderer.send(OVERLAY_ACTIONED, { id, x, y });
},
```

In `src/main/overlayManager.ts`, import `OVERLAY_ACTIONED`, register:

```ts
ipcMain.on(OVERLAY_ACTIONED, (event, raw: unknown) => {
  const p = raw as { id?: unknown; x?: unknown; y?: unknown } | null;
  if (!p || typeof p.id !== 'string' || p.id.trim() === '' || !isNum(p.x) || !isNum(p.y)) return;
  const displayId = this.displayOf(event.sender);
  if (displayId !== undefined) this.emit('action', { id: p.id, displayId, x: p.x, y: p.y });
});
```

No special `click` handling is needed for action because M1 has no action center click.

- [ ] **Step 12: Wire executor in main**

Modify `src/main/index.ts`:

```ts
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { executeAction } from './actionExecutor';
```

Add helper:

```ts
const runDetached = (command: string, args: string[]): Promise<void> => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, detached: false, stdio: 'ignore' });
  child.once('error', reject);
  child.once('spawn', resolve);
});
```

After `overlays` and `bridge` exist:

```ts
overlays.on('action', (p: { id: string }) => {
  const slot = settings.actionWheel.find((a) => a.id === p.id);
  if (!slot) {
    overlays.toast(text().actionFailed, text().actionMissing);
    return;
  }
  void executeAction(slot, {
    platform: PLATFORM,
    openExternal: (url) => shell.openExternal(url),
    openPath: (path) => shell.openPath(path),
    run: runDetached,
    writeClipboard: (value) => clipboard.writeText(value),
    injectKeys: (keys) => bridge.injectKeys(keys),
    exists: existsSync,
    now: () => new Date(),
    paths: { home: app.getPath('home'), desktop: app.getPath('desktop'), downloads: app.getPath('downloads') },
  }).then((result) => {
    if (result.ok) return;
    const t = text();
    const body = result.reason === 'missingConfig' ? t.actionMissingConfig
      : result.reason === 'invalidUrl' ? t.actionInvalidUrl
      : result.reason === 'pathMissing' ? t.actionPathMissing
      : result.reason === 'unsupported' ? t.actionUnsupported
      : result.message || t.actionOpenFailed;
    overlays.toast(t.actionFailed, body);
  }).catch((err: Error) => {
    console.warn('[action]', err);
    overlays.toast(text().actionFailed, text().actionOpenFailed);
  });
});
```

- [ ] **Step 13: Run Task 3 tests**

Run:

```powershell
npx vitest run tests/main/actionExecutor.test.ts tests/main/inputBridge.test.ts tests/main/overlayManager.test.ts
```

Expected: PASS.

- [ ] **Step 14: Commit Task 3**

```powershell
git add src/main/actionExecutor.ts src/main/inputBridge.ts src/shared/ipc.ts src/preload/overlay.ts src/main/overlayManager.ts src/main/index.ts tests/main/actionExecutor.test.ts tests/main/inputBridge.test.ts tests/main/overlayManager.test.ts
git commit -m "Execute actions from the main process"
```

---

### Task 4: Overlay Action Wheel Rendering

**Files:**
- Create: `assets/actions/screenshot.svg`
- Create: `assets/actions/desktop.svg`
- Create: `assets/actions/lock.svg`
- Create: `assets/actions/mute.svg`
- Create: `assets/actions/volume-up.svg`
- Create: `assets/actions/volume-down.svg`
- Create: `assets/actions/browser.svg`
- Create: `assets/actions/web.svg`
- Create: `assets/actions/app.svg`
- Create: `assets/actions/file.svg`
- Create: `assets/actions/folder.svg`
- Create: `assets/actions/downloads.svg`
- Create: `assets/actions/home.svg`
- Create: `assets/actions/calendar.svg`
- Create: `assets/actions/clock.svg`
- Modify: `src/renderer/overlay/main.ts`
- Modify: `src/renderer/overlay/env.d.ts`
- Test: `tests/renderer` if an overlay DOM test exists after local inspection; otherwise rely on TypeScript and manual overlay testing in Task 6.

**Interfaces:**
- Consumes: `OverlaySettings.actionWheel`.
- Consumes: `actionIconUrl(icon)` from `src/shared/actions.ts`.
- Consumes: `window.overlay.reportAction(id, x, y)`.
- Produces: a third `Wheel` instance selected when `p.wheel === 'action'`.

- [ ] **Step 1: Add action icon assets**

Create each `assets/actions/*.svg` as a 64x64 app-owned monochrome SVG. Use this structure for every file, changing only the inner path:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#14272b"/>
  <path d="M18 20h28v18H18zM24 44h16" fill="none" stroke="#d7c48a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Use simple recognizable shapes:
- `screenshot.svg`: crop corners.
- `desktop.svg`: monitor outline.
- `lock.svg`: shackle and body.
- `mute.svg`: speaker with slash.
- `volume-up.svg`: speaker with two waves.
- `volume-down.svg`: speaker with one wave.
- `browser.svg`: globe circle.
- `web.svg`: link chain.
- `app.svg`: four-square grid.
- `file.svg`: document with folded corner.
- `folder.svg`: folder tab.
- `downloads.svg`: down arrow into tray.
- `home.svg`: house.
- `calendar.svg`: calendar box.
- `clock.svg`: clock circle.

- [ ] **Step 2: Type-check before overlay changes**

Run: `npm run typecheck`

Expected: FAIL because Task 1 and Task 3 exposed new fields not yet consumed by all renderers, or PASS if TypeScript does not require renderer changes yet.

- [ ] **Step 3: Extend overlay API type**

Modify `src/renderer/overlay/env.d.ts` so `OverlayApi` includes `reportAction`. If it imports `OverlayApi` from preload, confirm no manual duplicate type is needed.

- [ ] **Step 4: Add the action wheel to overlay**

Modify `src/renderer/overlay/main.ts`:

```ts
import { actionIconUrl } from '../../shared/actions';
```

Create the third SVG and wheel near the emote wheel setup:

```ts
const actionSvg = pingSvg.cloneNode(false) as SVGSVGElement;
actionSvg.id = 'actionWheel';
emoteSvg.after(actionSvg);
const actionWheel = new Wheel(actionSvg, 'ACTION', actionIconUrl('app'), tick);
```

Add action items:

```ts
const actionItem = (slot: OverlaySettings['actionWheel'][number]): WheelItem => ({ key: slot.id, icon: actionIconUrl(slot.icon) });
```

Update `applySettings`:

```ts
actionWheel.setItems(s.actionWheel.map(actionItem));
```

Update wheel lookup:

```ts
const wheelOf = (p: { wheel?: WheelKind }): Wheel => (
  p.wheel === 'emote' ? emoteWheel : p.wheel === 'action' ? actionWheel : pingWheel
);
```

Update release handler:

```ts
if (p.wheel === 'action') {
  window.overlay.reportAction(chosen.key, chosen.x, chosen.y);
} else if (p.wheel === 'emote') {
  ...
}
```

Update cancel handler:

```ts
actionWheel.cancel();
```

- [ ] **Step 5: Include action SVG probing**

In `checkImages()`, include:

```ts
const actions = [...new Set(settings.actionWheel.map((a) => a.icon))]
  .map((icon) => probe(actionIconUrl(icon), `actions/${icon}.svg`));
return Promise.all([...pings, ...emotes, ...actions]).then(...);
```

- [ ] **Step 6: Run renderer typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```powershell
git add assets/actions src/renderer/overlay/main.ts src/renderer/overlay/env.d.ts
git commit -m "Render the action wheel overlay"
```

---

### Task 5: Settings UI for Action Wheel

**Files:**
- Create: `src/renderer/settings/components/ActionSection.tsx`
- Modify: `src/renderer/settings/App.tsx`
- Modify: `src/renderer/settings/settings.css`
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/settingsChannels.ts`
- Modify: `src/preload/settings.ts`
- Modify: `src/main/settingsIpc.ts`
- Test: `tests/main/settingsIpc.test.ts`

**Interfaces:**
- Consumes: `ACTION_TEMPLATES`, `DEFAULT_ACTION_WHEEL`, `ActionSlot`, `actionIconUrl`.
- Consumes: `WheelEditor<ActionSlot['id']>` pattern through an ID pool and local lookup map.
- Produces: `SettingsApi.pickFile()`, `SettingsApi.pickFolder()`, and action wheel setting patches.

- [ ] **Step 1: Add settings IPC tests for path dialogs**

In `tests/main/settingsIpc.test.ts`, extend the Electron mock:

```ts
dialog: {
  showOpenDialog: vi.fn(async (_opts: unknown) => ({ canceled: false, filePaths: ['C:\\Picked\\thing.exe'] })),
},
```

Add tests:

```ts
it('opens file and folder pickers', async () => {
  expect(await call(SETTINGS_CH.pickFile)).toBe('C:\\Picked\\thing.exe');
  expect(await call(SETTINGS_CH.pickFolder)).toBe('C:\\Picked\\thing.exe');
});

it('returns null when a picker is cancelled', async () => {
  const electron = await import('electron');
  vi.mocked(electron.dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] });
  expect(await call(SETTINGS_CH.pickFile)).toBeNull();
});
```

- [ ] **Step 2: Run settings IPC tests to verify they fail**

Run: `npx vitest run tests/main/settingsIpc.test.ts`

Expected: FAIL because `SETTINGS_CH.pickFile` and `SETTINGS_CH.pickFolder` do not exist.

- [ ] **Step 3: Add picker IPC**

Modify `src/shared/settingsChannels.ts`:

```ts
pickFile: 'dialog:pickFile',
pickFolder: 'dialog:pickFolder',
```

Modify `src/shared/ipc.ts` `SettingsApi`:

```ts
pickFile(): Promise<string | null>;
pickFolder(): Promise<string | null>;
```

Modify `src/preload/settings.ts`:

```ts
pickFile: () => ipcRenderer.invoke(SETTINGS_CH.pickFile),
pickFolder: () => ipcRenderer.invoke(SETTINGS_CH.pickFolder),
```

Modify `src/main/settingsIpc.ts` imports:

```ts
import { dialog, globalShortcut, ipcMain, shell } from 'electron';
```

Add handlers:

```ts
ipcMain.handle(SETTINGS_CH.pickFile, async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'] });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
ipcMain.handle(SETTINGS_CH.pickFolder, async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
```

- [ ] **Step 4: Run settings IPC tests to verify they pass**

Run: `npx vitest run tests/main/settingsIpc.test.ts`

Expected: PASS.

- [ ] **Step 5: Create ActionSection component**

Create `src/renderer/settings/components/ActionSection.tsx` with this structure:

```tsx
import { Button, Input } from '@fluentui/react-components';
import {
  Apps24Regular, CursorClick24Regular, Folder24Regular, Globe24Regular, Keyboard24Regular,
} from '@fluentui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ACTION_TEMPLATES, DEFAULT_ACTION_WHEEL, actionIconUrl, actionTemplate, type ActionKind, type ActionSlot,
} from '../../../shared/actions';
import { triggerLabel, type Settings } from '../../../shared/settings';
import type { WheelPatch } from '../../../shared/wheelLayout';
import { api } from '../api';
import { useText } from '../text';
import type { Update } from '../useAppState';
import { SettingRow } from './rows';
import { TriggerPicker } from './TriggerPicker';
import { WheelEditor, type PoolItem } from './WheelEditor';

type ActionPoolId = string;

const cloneForSlot = (template: ActionSlot, index: number): ActionSlot => ({
  ...template,
  id: `action-${index}-${template.kind}-${Date.now().toString(36)}`,
  params: template.params ? { ...template.params } : undefined,
});

function patchForDrop(current: readonly ActionSlot[], p: WheelPatch<ActionPoolId>): Partial<Settings> {
  const next = current.map((a) => ({ ...a, params: a.params ? { ...a.params } : undefined }));
  if (!p.wheel) return {};
  return { actionWheel: p.wheel.map((id, i) => {
    const existing = next.find((a) => a.id === id);
    if (existing) return existing;
    const kind = id.replace(/^template:/, '') as ActionKind;
    return cloneForSlot(actionTemplate(kind), i);
  }) };
}

export function ActionSection({ settings: s, update }: { settings: Settings; update: Update }) {
  const t = useText();
  const [keyError, setKeyError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(s.actionWheel[0]?.id ?? '');
  useEffect(() => {
    if (!s.actionWheel.some((a) => a.id === selected)) setSelected(s.actionWheel[0]?.id ?? '');
  }, [s.actionWheel, selected]);
  const keyOff = s.actionTrigger === 'off';
  const key = keyOff ? t.actionKey : triggerLabel(s.actionTrigger, t.lang, api.platform);
  const wheelIds = s.actionWheel.map((a) => a.id);
  const pool: PoolItem<ActionPoolId>[] = [
    ...s.actionWheel.map((a) => ({ id: a.id, icon: actionIconUrl(a.icon), name: a.label })),
    ...ACTION_TEMPLATES.map((a) => ({ id: `template:${a.kind}`, icon: actionIconUrl(a.icon), name: t.actionNames[a.kind] })),
  ];
  const selectedSlot = s.actionWheel.find((a) => a.id === selected);
  const updateSlot = (patch: Partial<ActionSlot>) => {
    if (!selectedSlot) return;
    void update({
      actionWheel: s.actionWheel.map((a) => (a.id === selectedSlot.id
        ? { ...a, ...patch, params: patch.params ?? a.params }
        : a)),
    });
  };
  return (
    <>
      <SettingRow icon={<Keyboard24Regular />} title={t.actionKey} description={keyOff ? t.actionKeyOffDesc : t.actionKeyDesc}>
        <TriggerPicker value={s.actionTrigger} offOption blocked={s.trigger}
          onChange={(k) => void update({ actionTrigger: k }).then((r) => setKeyError(r.ok ? null : r.error))} />
      </SettingRow>
      {keyError ? <div className="rowError" role="alert">{keyError}</div> : null}
      <WheelEditor
        wheel={wheelIds}
        center={wheelIds[0] ?? ''}
        centerOn={false}
        trigger={key}
        pool={pool}
        defaults={{ wheel: DEFAULT_ACTION_WHEEL.map((a) => a.id), center: DEFAULT_ACTION_WHEEL[0].id }}
        labels={{ title: t.actionWheelTitle, desc: t.actionWheelDesc(key), poolTitle: t.actionLibrary, poolDesc: t.actionLibraryDesc }}
        onChange={(patch) => void update(patchForDrop(s.actionWheel, patch))}
        onPreview={(id) => setSelected(id)}
      />
      {selectedSlot ? (
        <div className="card actionEditor">
          <div className="lbl">{t.actionEditTitle(selectedSlot.label)}<span className="desc">{t.actionEditDesc}</span></div>
          <Input value={selectedSlot.label} onChange={(_, d) => updateSlot({ label: d.value })} />
          {selectedSlot.kind === 'openUrl' ? (
            <Input value={selectedSlot.params?.url ?? ''} aria-label={t.actionUrl}
              onChange={(_, d) => updateSlot({ params: { url: d.value } })} />
          ) : null}
          {selectedSlot.kind === 'openApp' || selectedSlot.kind === 'openFile' || selectedSlot.kind === 'openFolder' ? (
            <div className="actionPathRow">
              <Input value={selectedSlot.params?.path ?? ''} onChange={(_, d) => updateSlot({ params: { path: d.value } })} />
              <Button
                icon={selectedSlot.kind === 'openFolder' ? <Folder24Regular /> : <Apps24Regular />}
                onClick={async () => {
                  const picked = selectedSlot.kind === 'openFolder' ? await api.pickFolder() : await api.pickFile();
                  if (picked) updateSlot({ params: { path: picked } });
                }}
              >
                {t.browse}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
```

After creating it, remove unused imports from the snippet; `Globe24Regular` and `CursorClick24Regular` are only needed if used in final JSX.

- [ ] **Step 6: Add settings page navigation**

Modify `src/renderer/settings/App.tsx`:

```ts
import { ActionSection } from './components/ActionSection';
import { Apps24Regular } from '@fluentui/react-icons';
```

Add section:

```ts
{ id: 'actions', label: (t) => t.navActions, icon: <Apps24Regular /> },
```

Place it after `emotes` or before `room`:

```tsx
<div className="section" id="actions">{t.navActions}</div>
<ActionSection settings={s} update={update} />
```

Update the ping trigger picker so it blocks action too. If `TriggerPicker` only accepts one blocked trigger, add a `blockedList?: EmoteTriggerKey[]` prop and update its disabled logic to check every blocked trigger. Then call:

```tsx
<TriggerPicker value={s.trigger} blockedList={[s.emoteTrigger, s.actionTrigger]}
  onChange={(k) => { if (k !== 'off') void update({ trigger: k }); }} />
```

Update `EmoteSection` so the emote trigger picker receives `blockedList={[s.trigger, s.actionTrigger]}`.

- [ ] **Step 7: Add settings CSS**

Modify `src/renderer/settings/settings.css`:

```css
.actionEditor {
  display: grid;
  gap: 12px;
}

.actionPathRow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
```

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`

Expected: FAIL for missing i18n strings until Task 6, or PASS if strings are added in this task.

- [ ] **Step 9: Commit Task 5**

If typecheck fails only because Task 6 strings are absent, do not commit yet. Otherwise:

```powershell
git add src/renderer/settings/components/ActionSection.tsx src/renderer/settings/App.tsx src/renderer/settings/settings.css src/shared/ipc.ts src/shared/settingsChannels.ts src/preload/settings.ts src/main/settingsIpc.ts tests/main/settingsIpc.test.ts
git commit -m "Add action wheel settings editor"
```

---

### Task 6: Strings, About Problems, Final Verification

**Files:**
- Modify: `src/shared/i18n.ts`
- Modify: `src/main/settingsStore.ts`
- Modify: `src/main/settingsIpc.ts`
- Modify: `src/main/index.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Test: `tests/shared/i18n.test.ts`
- Test: `tests/main/settingsStore.test.ts`
- Test: full test commands below

**Interfaces:**
- Consumes: action trigger clash information from settings normalization and store load.
- Produces: user-facing strings for settings, toasts, errors, About problems, README usage.

- [ ] **Step 1: Add i18n keys**

Modify the English and Simplified Chinese string objects in `src/shared/i18n.ts`.

Add English keys:

```ts
navActions: 'Actions',
actionKey: 'Action key',
actionKeyDesc: 'Hold this and drag to open the action wheel.',
actionKeyOffDesc: 'The action wheel is off. Pick a key to turn it on.',
actionWheelTitle: 'Customize the action wheel',
actionWheelDesc: (key: string) => `Hold ${key} and drag, then release on an action.`,
actionLibrary: 'Actions',
actionLibraryDesc: 'Drag an action onto a wheel slot, then edit its details below.',
actionEditTitle: (name: string) => `Edit ${name}`,
actionEditDesc: 'Actions with a URL or path need details before they can run.',
actionUrl: 'URL',
browse: 'Browse',
actionFailed: 'Action failed',
actionMissing: 'That action is no longer on the wheel.',
actionMissingConfig: 'Configure this action in Settings first.',
actionInvalidUrl: 'Use an http or https URL.',
actionPathMissing: 'That path does not exist.',
actionUnsupported: 'This action is not supported on this platform yet.',
actionOpenFailed: 'The action could not be opened.',
actionKeyClash: 'The ping trigger, emote key and action key must be different, and custom wheel keys cannot be the pause shortcut key.',
problemActionKeyClash: 'The action key was the same as another lolPing key, so it was turned off.',
actionNames: {
  screenshot: 'Screenshot',
  showDesktop: 'Show desktop',
  lockScreen: 'Lock screen',
  muteToggle: 'Mute/unmute',
  volumeUp: 'Volume up',
  volumeDown: 'Volume down',
  openBrowser: 'Open browser',
  openUrl: 'Open website',
  openApp: 'Open app',
  openFile: 'Open file',
  openFolder: 'Open folder',
  openDownloads: 'Open Downloads',
  openDesktop: 'Open Desktop',
  openHome: 'Open Home',
  copyDate: 'Copy date',
  copyTime: 'Copy time',
},
```

Add equivalent Simplified Chinese strings:

```ts
navActions: '动作',
actionKey: '动作键',
actionKeyDesc: '按住此键并拖动以打开动作轮盘。',
actionKeyOffDesc: '动作轮盘已关闭。选择一个键即可开启。',
actionWheelTitle: '自定义动作轮盘',
actionWheelDesc: (key: string) => `按住 ${key} 并拖动，然后在某个动作上松开。`,
actionLibrary: '动作库',
actionLibraryDesc: '把动作拖到轮盘槽位上，再在下方编辑细节。',
actionEditTitle: (name: string) => `编辑 ${name}`,
actionEditDesc: '需要网址或路径的动作要先配置后才能执行。',
actionUrl: '网址',
browse: '浏览',
actionFailed: '动作失败',
actionMissing: '这个动作已经不在轮盘上。',
actionMissingConfig: '请先在设置中配置这个动作。',
actionInvalidUrl: '请使用 http 或 https 网址。',
actionPathMissing: '这个路径不存在。',
actionUnsupported: '此平台暂不支持这个动作。',
actionOpenFailed: '无法打开这个动作。',
actionKeyClash: '信号触发键、表情键和动作键必须互不相同，自定义轮盘键也不能是暂停快捷键的按键。',
problemActionKeyClash: '动作键与 lolPing 的另一个按键相同，已被关闭。',
actionNames: {
  screenshot: '截图',
  showDesktop: '显示桌面',
  lockScreen: '锁屏',
  muteToggle: '静音/取消静音',
  volumeUp: '音量加',
  volumeDown: '音量减',
  openBrowser: '打开浏览器',
  openUrl: '打开网站',
  openApp: '打开应用',
  openFile: '打开文件',
  openFolder: '打开文件夹',
  openDownloads: '打开下载目录',
  openDesktop: '打开桌面目录',
  openHome: '打开用户目录',
  copyDate: '复制日期',
  copyTime: '复制时间',
},
```

- [ ] **Step 2: Run i18n tests to verify structural errors**

Run: `npx vitest run tests/shared/i18n.test.ts`

Expected: PASS after all keys exist in both languages.

- [ ] **Step 3: Track action key clash problems**

Modify `src/main/settingsStore.ts`:

```ts
/** True when load() read an action key that clashed with another lolPing key and turned it off. */
actionKeyClashed = false;
```

In `load()` reset:

```ts
this.actionKeyClashed = false;
```

After normalization:

```ts
this.actionKeyClashed = 'actionTrigger' in stored && stored.actionTrigger !== 'off' && this.current.actionTrigger === 'off';
```

Modify `src/main/settingsIpc.ts`, when `patchClashes` rejects:

```ts
return { ok: false, error: d.text().actionKeyClash, settings: d.store.get() };
```

If the rejected patch only touches emote fields, returning `emoteKeyClash` is also acceptable. Prefer the broader `actionKeyClash` because the rule now covers all wheel triggers.

Modify `src/main/index.ts` `about()`:

```ts
...(store.actionKeyClashed ? [text().problemActionKeyClash] : []),
```

- [ ] **Step 4: Update README usage**

Modify `README.md`:
- Add action wheel usage row: `Hold Win and drag | Run an action from the action wheel`.
- Add settings bullet for **Action wheel**: trigger key, wheel slots, built-in action library, URL/app/file/folder parameters.
- Add known limitation: Windows desktop operations are Windows-first; macOS may show unsupported action toasts.

Modify `README.zh-CN.md` with the same content in Chinese. Preserve the current encoding behavior of the file; if the file appears mojibake in PowerShell, use the existing file's language structure and avoid changing unrelated text.

- [ ] **Step 5: Run all focused tests**

Run:

```powershell
npx vitest run tests/shared/actions.test.ts tests/shared/settings.test.ts tests/shared/protocol.test.ts tests/shared/i18n.test.ts tests/main/actionExecutor.test.ts tests/main/inputBridge.test.ts tests/main/overlayManager.test.ts tests/main/settingsIpc.test.ts tests/helper/protocol.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run broad verification**

Run:

```powershell
npm run build:helper
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 7: Manual Windows verification**

Run the app:

```powershell
npm run dev
```

Verify:
- Alt + drag still opens the ping wheel.
- Ctrl + drag still opens the emote wheel.
- Win + drag opens the action wheel.
- Screenshot starts the Windows snipping UI.
- Show desktop triggers Win + D.
- Mute, volume up, and volume down work.
- Lock screen locks the workstation; save work before testing.
- Open URL opens the configured URL.
- Open app/file/folder opens configured paths.
- Missing URL/path shows a toast instead of doing nothing.
- Settings can change the action trigger and reset the action wheel.

- [ ] **Step 8: Commit Task 6**

```powershell
git add src/shared/i18n.ts src/main/settingsStore.ts src/main/settingsIpc.ts src/main/index.ts README.md README.zh-CN.md tests/shared/i18n.test.ts tests/main/settingsStore.test.ts
git commit -m "Finish action wheel user experience"
```

---

## Self-Review Checklist

- Spec coverage:
  - One action wheel is covered in Tasks 1, 4 and 5.
  - Default Win trigger and configurable trigger are covered in Tasks 1, 2, 5 and 6.
  - Windows-first desktop actions are covered in Task 3.
  - Overlay-only selection and main-process execution are covered in Tasks 3 and 4.
  - Reuse of existing `Wheel` and `WheelEditor` is covered in Tasks 4 and 5.
  - Screenshot via Win + Shift + S is covered in Task 3.
  - Excluded features remain out of scope in Global Constraints.
- Placeholder scan:
  - No task uses undefined function names without defining their interface in an earlier task.
  - No task asks for generic tests without concrete test code.
- Type consistency:
  - `ActionSlot`, `ActionKind`, `actionWheel`, `actionTrigger`, `OVERLAY_ACTIONED`, `executeAction`, and `injectKeys` use the same names across tasks.
  - Helper command name is consistently `injectKeys`.
  - Wheel kind string is consistently `'action'`.

