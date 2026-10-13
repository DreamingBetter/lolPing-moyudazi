# Room Chat Danmaku Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live room chat messages as configurable desktop danmaku on the primary overlay without changing the chat transcript or room protocol.

**Architecture:** `RoomManager` emits a local-only `chatMessage` event for validated live messages. The main process forwards that event through `OverlayManager` to the primary overlay window, where a dedicated `ChatDanmakuStage` schedules right-to-left text items with bounded active and pending work. Settings normalization owns all user-editable danmaku values and the existing overlay settings update path keeps the renderer in sync.

**Tech Stack:** Electron main process, TypeScript, React settings renderer, Fluent UI, DOM/CSS overlay renderer, Vitest.

## Global Constraints

- Danmaku is enabled by default.
- Show local messages only after `sendChat()` or `retryChat()` succeeds.
- Show remote live messages once after validation, dedupe and rate limiting.
- Never show recovered `chatHistory` messages as danmaku.
- Chat danmaku ignores ping pause, room mute, per-member mute and ping/emote audio settings.
- Danmaku is shown on the primary display only for the first version.
- Overlay remains transparent, click-through, focus-free and non-interactive.
- Message text is plain text only and must be inserted with `textContent`, never `innerHTML`.
- Settings: `chatDanmakuEnabled` default `true`; `chatDanmakuArea` default `half`; `chatDanmakuSpeed` default `normal`; `chatDanmakuSizePx` default `24` and range `16..36`; `chatDanmakuOpacity` default `85` and range `40..100`.
- Do not increase the existing room chat transcript limit as part of this work.
- Preserve previous uncommitted Chat page changes in this worktree.

---

## File Structure

- `src/shared/settings.ts`: danmaku setting types, defaults, limits, normalization, and overlay extraction.
- `src/shared/ipc.ts`: the `chat:spawn` overlay event payload.
- `src/shared/roomChat.ts`: `LiveChatMessage`.
- `src/main/roomManager.ts`: live `chatMessage` emission.
- `src/main/index.ts`: `RoomManager` to `OverlayManager` forwarding.
- `src/main/overlayManager.ts`: primary-display danmaku forwarding.
- `src/renderer/overlay/chatDanmaku.ts`: DOM creation, track scheduling, queue caps, cleanup, settings application.
- `src/renderer/overlay/main.ts`: overlay layer creation and event wiring.
- `src/renderer/overlay/overlay.css`: danmaku layer styling and animation.
- `src/renderer/settings/components/ChatSection.tsx`: danmaku settings controls.
- `src/renderer/settings/App.tsx`: passes `settings` and `update` to `ChatSection`.
- `src/shared/i18n.ts`: labels for danmaku settings.
- Tests: `tests/shared/settings.test.ts`, `tests/main/roomManager.test.ts`, `tests/main/overlayManager.test.ts`, `tests/renderer/chatDanmaku.test.ts`, `tests/shared/i18n.test.ts`.

---

### Task 1: Shared Danmaku Settings and Overlay IPC Types

**Files:**
- Modify: `src/shared/settings.ts`
- Modify: `src/shared/ipc.ts`
- Test: `tests/shared/settings.test.ts`

**Interfaces:**
- Produces `ChatDanmakuArea = 'quarter' | 'half' | 'threeQuarter' | 'full'`
- Produces `ChatDanmakuSpeed = 'slow' | 'normal' | 'fast'`
- Adds `Settings.chatDanmakuEnabled`, `Settings.chatDanmakuArea`, `Settings.chatDanmakuSpeed`, `Settings.chatDanmakuSizePx`, `Settings.chatDanmakuOpacity`
- Adds those five fields to `OverlaySettings`
- Adds `OverlayEvents['chat:spawn'] = { id: string; name: string; color: number; text: string }`

- [ ] **Step 1: Write failing settings tests**

Add tests asserting default values, valid values, invalid enum fallback, size/opacity clamp and `overlaySettings()` extraction:

```ts
expect(normalizeSettings(undefined)).toMatchObject({
  chatDanmakuEnabled: true,
  chatDanmakuArea: 'half',
  chatDanmakuSpeed: 'normal',
  chatDanmakuSizePx: 24,
  chatDanmakuOpacity: 85,
});
expect(normalizeSettings({ chatDanmakuArea: 'bad', chatDanmakuSpeed: 'warp', chatDanmakuSizePx: 6, chatDanmakuOpacity: 130 })).toMatchObject({
  chatDanmakuArea: 'half',
  chatDanmakuSpeed: 'normal',
  chatDanmakuSizePx: 16,
  chatDanmakuOpacity: 100,
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/settings.test.ts`

Expected: FAIL because danmaku fields do not exist.

- [ ] **Step 3: Write minimal implementation**

In `settings.ts`, add the two exported union types, include the five fields in `Settings`, `DEFAULT_SETTINGS`, `LIMITS`, `BoolKey`, `normalizeSettings()`, `OverlaySettings`, and `overlaySettings()`. Use an enum helper that falls back to defaults for invalid area and speed values. In `ipc.ts`, add `chat:spawn` and include it in `OVERLAY_CHANNELS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/shared/settings.test.ts`

Expected: PASS.

---

### Task 2: RoomManager Live Chat Event

**Files:**
- Modify: `src/shared/roomChat.ts`
- Modify: `src/main/roomManager.ts`
- Test: `tests/main/roomManager.test.ts`

**Interfaces:**
- Produces `LiveChatMessage` and `RoomManager` event `'chatMessage'` with `{ id, peer, name, color, ts, text, self }`.

- [ ] **Step 1: Write failing RoomManager tests**

Track `liveChats: LiveChatMessage[]` in setup with `room.on('chatMessage', ...)`. Add tests for successful local send, failed local send, successful retry, remote live message, and history merge not emitting.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/main/roomManager.test.ts`

Expected: FAIL because no live event is emitted.

- [ ] **Step 3: Write minimal implementation**

Export `LiveChatMessage` from `roomChat.ts`. In `RoomManager`, add `emitChatMessage(message: RoomChatMessage)`. Call it only after local `sendChat()` succeeds, after `retryChat()` succeeds, and after accepted remote `receiveChat()` messages. Do not call it from `receiveChatHistory()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/main/roomManager.test.ts`

Expected: PASS.

---

### Task 3: Main Process and Overlay Routing

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/overlayManager.ts`
- Test: `tests/main/overlayManager.test.ts`

**Interfaces:**
- Consumes `LiveChatMessage`.
- Produces `OverlayManager.spawnChatDanmaku(message)` that sends `chat:spawn` to `screen.getPrimaryDisplay().id`.

- [ ] **Step 1: Write failing OverlayManager tests**

Add tests asserting `spawnChatDanmaku()` sends `{ id, name, color, text }` to display 1 only and sends nothing after that window is destroyed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/main/overlayManager.test.ts`

Expected: FAIL because `spawnChatDanmaku` does not exist.

- [ ] **Step 3: Write minimal implementation**

Add `spawnChatDanmaku()` to `OverlayManager`. In `index.ts`, subscribe with `room.on('chatMessage', (m) => overlays.spawnChatDanmaku(m));`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/main/overlayManager.test.ts`

Expected: PASS.

---

### Task 4: Overlay Renderer Danmaku Stage

**Files:**
- Create: `src/renderer/overlay/chatDanmaku.ts`
- Modify: `src/renderer/overlay/main.ts`
- Modify: `src/renderer/overlay/overlay.css`
- Test: `tests/renderer/chatDanmaku.test.ts`

**Interfaces:**
- Produces `ChatDanmakuStage` with `applySettings(settings)`, `spawn(message)`, `clear()`, and `debugCounts()` for tests.

- [ ] **Step 1: Write failing renderer tests**

Create tests for disabled suppression, `textContent` insertion, active/pending caps, and removal on `animationend`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/renderer/chatDanmaku.test.ts`

Expected: FAIL because the stage does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement `MAX_ACTIVE = 24`, `MAX_PENDING = 24`, track count from configured area and font size, right-to-left CSS animation custom properties, sender/text spans with `textContent`, and immediate `clear()` on disable.

- [ ] **Step 4: Wire overlay**

Create a `#chatDanmaku` layer in `main.ts`, instantiate `ChatDanmakuStage`, call `applySettings(s)` with the existing settings update, and handle `window.overlay.on('chat:spawn', ...)`. Add CSS for layer, item, name, text, and `@keyframes chatDanmakuFly`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/renderer/chatDanmaku.test.ts`

Expected: PASS.

---

### Task 5: Chat Settings UI and Copy

**Files:**
- Modify: `src/renderer/settings/components/ChatSection.tsx`
- Modify: `src/renderer/settings/App.tsx`
- Modify: `src/shared/i18n.ts`
- Modify: `src/renderer/settings/settings.css`
- Test: `tests/shared/i18n.test.ts`

**Interfaces:**
- Consumes `Settings` and `Update`.
- Produces settings controls for enabled, area, speed, font size, and opacity.

- [ ] **Step 1: Write failing i18n test**

Add direct assertions:

```ts
expect(strings('en').chatDanmaku).toBe('Chat danmaku');
expect(strings('en').chatDanmakuAreaHalf).toBe('Top half');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/shared/i18n.test.ts`

Expected: FAIL because strings do not exist.

- [ ] **Step 3: Write minimal implementation**

Add `settings` and `update` props to `ChatSection`, pass them from `App.tsx`, and add a settings block below the chat window or empty state. Use `SwitchRow`, Fluent `Dropdown` inside `SettingRow`, and `SliderRow`. Dim non-toggle rows when disabled. Add matching English and Chinese keys.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/shared/i18n.test.ts`

Expected: PASS.

---

### Task 6: Final Verification and Packaging

**Files:**
- No source edits expected unless verification exposes a defect.

**Interfaces:**
- Produces verified build and Windows packaged artifacts when the local native helper is present.

- [ ] **Step 1: Run focused test suite**

Run:

```powershell
npm test -- tests/shared/settings.test.ts
npm test -- tests/main/roomManager.test.ts
npm test -- tests/main/overlayManager.test.ts
npm test -- tests/renderer/chatDanmaku.test.ts
npm test -- tests/renderer/chatView.test.ts
npm test -- tests/shared/i18n.test.ts
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Run production build**

Run: `npm run build`

- [ ] **Step 4: Package Windows setup and unpacked app**

Run:

```powershell
npx electron-builder --win --publish never --config.electronDist=node_modules/electron/dist
```

- [ ] **Step 5: Summarize outputs**

Report feature behaviour, verification commands, and exact release artifact paths.

---

## Self-Review

- Spec coverage: settings, live-only events, primary-display routing, bounded non-interactive overlay rendering, user controls, verification and packaging are all represented.
- Placeholder scan: no TBD or deferred implementation steps remain.
- Type consistency: `LiveChatMessage`, `chat:spawn`, `ChatDanmakuStage`, and the five settings fields are named consistently.
