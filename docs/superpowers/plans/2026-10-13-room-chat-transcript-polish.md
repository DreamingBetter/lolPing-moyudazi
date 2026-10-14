# Room Chat Transcript Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize room chat messages into name-above-bubble rows with hover timestamps and a clickable failure indicator, while adding a colon to danmaku sender names.

**Architecture:** Keep `RoomChatMessage.status` and the existing main-process retry API unchanged. Add two small renderer helpers for presentation decisions, update `ChatMessage` markup to separate sender, bubble, failure retry and timestamp, and use CSS hover/focus states to reveal the timestamp without affecting the message layout.

**Tech Stack:** React, Fluent UI icons/buttons, TypeScript, CSS, Vitest.

## Global Constraints

- Do not change the room chat network protocol or send/retry behavior.
- Keep successful and in-progress status text out of the visible transcript.
- Only local failed messages show a retry affordance.
- The retry affordance is a red exclamation icon and is clickable.
- Sender names in the chat transcript and danmaku end with `:`.
- Timestamps are hidden by default and appear beside the bubble on row hover or focus.
- Preserve current member-name lookup so renamed members update old messages.
- Preserve plain-text message rendering and multiline wrapping.

---

### Task 1: Lock Presentation Rules With Tests

**Files:**
- Modify: `src/renderer/settings/chatView.ts`
- Modify: `tests/renderer/chatView.test.ts`

- [ ] **Step 1: Write failing tests**

Add:

```ts
expect(chatMessageNameLabel({ name: 'Alex', color: 2 })).toBe('Alex:');
expect(shouldShowChatRetry({ ...message('me', 'Me', 1), self: true, status: 'failed' })).toBe(true);
expect(shouldShowChatRetry({ ...message('me', 'Me', 1), self: true, status: 'sent' })).toBe(false);
expect(shouldShowChatRetry({ ...message('peer', 'Alex', 2), self: false, status: 'failed' })).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/renderer/chatView.test.ts`

Expected: FAIL because the presentation helpers do not exist.

- [ ] **Step 3: Implement the minimal helpers**

Add:

```ts
export function chatMessageNameLabel(view: ChatMessageView): string {
  return `${view.name}:`;
}

export function shouldShowChatRetry(message: RoomChatMessage): boolean {
  return message.self && message.status === 'failed';
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/renderer/chatView.test.ts`

Expected: PASS.

---

### Task 2: Rebuild Chat Message Presentation

**Files:**
- Modify: `src/renderer/settings/components/ChatSection.tsx`
- Modify: `src/renderer/settings/settings.css`

- [ ] **Step 1: Write the failing UI-facing assertion**

Use the helpers from Task 1 in `ChatMessage` and remove the visible status
mapping. The test from Task 1 must remain green before touching the component.

- [ ] **Step 2: Implement the message markup**

Replace the current one-line metadata layout with:

```tsx
<div className={`chatMessage${message.self ? ' self' : ''}${message.status === 'failed' ? ' failed' : ''}`} tabIndex={0}>
  <span className="chatName" style={{ color: TAG_COLORS[view.color] }}>
    {chatMessageNameLabel(view)}
  </span>
  <div className="chatMessageLine">
    <div className="chatMessageBody">{message.text}</div>
    {shouldShowChatRetry(message) ? (
      <Tooltip content={t.chatRetry} relationship="label">
        <Button className="chatRetryButton" size="small" appearance="subtle" icon={<ErrorCircle24Regular />}
          aria-label={t.chatRetry} onClick={() => onRetry(message.id)} />
      </Tooltip>
    ) : null}
    <time className="chatMessageTime" dateTime={new Date(message.ts).toISOString()}>{time}</time>
  </div>
</div>
```

Do not render `chatSending`, `chatSent` or `chatFailed` as visible text.

- [ ] **Step 3: Implement the CSS layout**

Use:

```css
.chatMessage { ... outline: none; }
.chatMessage:focus-visible { outline: 2px solid var(--colorStrokeFocus2); outline-offset: 3px; }
.chatName { ... }
.chatMessageLine { display: flex; align-items: center; gap: 6px; }
.chatMessageTime { width: 42px; color: var(--text3); font-size: 10px; opacity: 0; transition: opacity .12s ease-out; }
.chatMessage:hover .chatMessageTime,
.chatMessage:focus-within .chatMessageTime { opacity: 1; }
.chatRetryButton { flex: none; color: #e05a47; }
.chatRetryButton:hover { color: #ff705b; }
```

Keep self messages right aligned and incoming messages left aligned. The
timestamp must occupy a stable width so revealing it does not move the bubble.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm test -- tests/renderer/chatView.test.ts
npm test -- tests/main/roomManager.test.ts
```

Expected: PASS.

---

### Task 3: Add the Danmaku Colon

**Files:**
- Modify: `src/renderer/overlay/chatDanmaku.ts`
- Modify: `tests/renderer/chatDanmaku.test.ts`

- [ ] **Step 1: Write the failing assertion**

After spawning a message, assert:

```ts
expect(item.find('chatDanmakuName')[0].textContent).toBe('Alex:');
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/renderer/chatDanmaku.test.ts`

Expected: FAIL because the sender span currently contains only `Alex`.

- [ ] **Step 3: Implement the colon**

Set the sender span text with `textContent = \`${message.name}:\``. Keep the
message text in its own text span and do not use `innerHTML`.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- tests/renderer/chatDanmaku.test.ts`

Expected: PASS.

---

### Task 4: Verify the Branch

**Files:**
- No source edits expected unless verification finds a defect.

- [ ] **Step 1: Run focused chat tests**

```powershell
npm test -- tests/renderer/chatView.test.ts
npm test -- tests/renderer/chatDanmaku.test.ts
npm test -- tests/main/roomManager.test.ts
npm test -- tests/shared/i18n.test.ts
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Run production build**

Run: `npm run build`

- [ ] **Step 4: Report**

Summarize the new chat layout, the failure retry affordance, the hover
timestamp behavior, and the danmaku colon. Report any unrelated existing
full-suite flakes separately.

---

## Self-Review

- Spec coverage: name colon, name-above-bubble layout, hidden successful status,
  failed retry icon, hover timestamp, rename lookup and danmaku text are all
  covered.
- Placeholder scan: no TBD or vague implementation steps.
- Type consistency: the helpers and component signatures use existing
  `ChatMessageView` and `RoomChatMessage` types.
