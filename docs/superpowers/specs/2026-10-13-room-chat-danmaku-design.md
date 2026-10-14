# Room Chat Danmaku Design

**Date:** 2026-10-13
**Status:** Proposed
**Builds on:** `docs/superpowers/specs/2026-10-12-room-chat-design.md`

## 1. Goal

Add an optional desktop danmaku layer for room chat. Live chat messages should
float across the desktop while the existing Chat page remains the source of
truth for the transcript.

The first version is intentionally small:

- Plain-text messages only, as chat already defines.
- Show both local messages and live messages received from room members.
- Do not replay messages recovered through chat history.
- Do not affect the existing chat transcript, room networking or ping/emote
  behavior.
- The overlay stays click-through, focus-free and does not intercept input.

This follows common live-chat danmaku conventions: right-to-left movement,
multiple horizontal tracks, collision avoidance, and controls for visibility,
area, speed, size and opacity.

## 2. User Experience

### 2.1 Default behavior

- Danmaku is enabled by default.
- A locally sent message appears after the room accepts the send.
- A remote message appears once when received live.
- A message obtained through `chatHistory` is added to the Chat page only; it
  never becomes a new danmaku.
- A failed local send does not appear. A later successful retry appears once.
- Existing room mute, per-member mute, and the global ping pause do not hide
  chat or chat danmaku. The danmaku switch is the explicit control for it.
- Danmaku is shown on the primary display only in the first version. This
  avoids duplicate copies on multi-monitor desktops and matches the existing
  primary-display toast behavior. Multi-display routing is out of scope.

### 2.2 Visual treatment

- Messages travel from right to left.
- The stage occupies the configured portion of the top of the primary display.
  The bottom of the screen remains clear by default.
- Each item displays the current sender name followed by the message text.
- The sender name uses the room tag colour. The message text uses a readable
  neutral colour.
- A subtle translucent dark backing and text shadow keep messages readable on
  bright desktop content without looking like a notification card.
- The overlay has `pointer-events: none`, no focus, no click action, no sound
  and no notification history.
- Long messages remain one scrolling item. They are clipped only by the
  viewport as they leave the screen; chat itself keeps the complete text.

### 2.3 Settings

The Chat section adds a Danmaku settings group:

| Setting | Type | Default | Behavior |
| --- | --- | --- | --- |
| Show chat danmaku | boolean | `true` | Turning it off immediately removes active danmaku and clears pending visual items. |
| Display area | `quarter \| half \| threeQuarter \| full` | `half` | Uses the top 25%, 50%, 75% or 100% of the primary display. |
| Speed | `slow \| normal \| fast` | `normal` | Controls pixels per second. Existing items keep their current speed; new items use the latest setting. |
| Font size | number, 16-36 px | `24` | Applies to new items. |
| Opacity | number, 40-100 | `85` | Applies to new items and the stage background/text styling. |

There is no user-facing density setting in the first version. The scheduler
automatically limits the number of active items and drops visual work when the
stage is full, so a message burst cannot degrade the desktop or delay the
actual chat send.

## 3. Architecture

The existing main-process room/network boundary remains authoritative:

```text
RoomManager
  +-- chatState -> settings renderer transcript
  +-- live chat event -> main index -> OverlayManager
                                      +-- primary overlay window
                                           +-- ChatDanmakuStage
```

### 3.1 RoomManager live-message event

Add a `chatMessage` event to `RoomManager` for visual consumers. It carries the
already validated live message data:

```ts
interface LiveChatMessage {
  id: string;
  peer: string;
  name: string;
  color: number;
  ts: number;
  text: string;
  self: boolean;
}
```

Event rules:

- `sendChat()` emits after the local message is accepted and marked `sent`.
- `retryChat()` emits after a previously failed message is successfully sent.
- `receiveChat()` emits after dedupe, validation and rate limiting succeed.
- `receiveChatHistory()` never emits.
- The existing 50-message in-memory transcript remains unchanged.

The event is an in-process notification only. It is not a new network packet
and does not change the room protocol or history format.

### 3.2 Main process and overlay

- `src/main/index.ts` subscribes to `room.on('chatMessage')`.
- `OverlayManager` exposes `spawnChatDanmaku(message)` and sends a new
  `chat:spawn` overlay event to the primary display.
- The event payload contains only validated display data: message id, sender
  name, colour, and text.
- `OverlayEvents` and `OverlayChannel` are extended with `chat:spawn`.
- Chat danmaku is not routed through the settings window and is not rendered
  as a toast.
- Existing `overlay:settings` carries the danmaku settings along with the
  other overlay settings, so settings changes take effect without a new IPC
  channel.

If the overlay window is not ready when a live message arrives, that visual
instance may be dropped. The Chat page and in-memory transcript remain the
reliable record; danmaku is intentionally ephemeral.

### 3.3 Renderer stage

Add a dedicated `ChatDanmakuStage` in the overlay renderer. It owns:

- A DOM layer under the existing transparent overlay root.
- A fixed number of horizontal tracks calculated from display area and font
  size.
- Track availability and active item cleanup.
- A bounded active-item count and a bounded pending queue.
- Applying the current settings to future items.

Scheduling rules:

1. Measure the rendered item width after inserting it offscreen.
2. Pick an available track using round-robin order to avoid repeatedly using
   the same line.
3. Animate from `viewportWidth` to `-itemWidth`.
4. Duration is derived from item width, viewport width and the selected speed.
5. Remove the item after the animation completes.
6. If no track can accept an item without overlap, keep only a small bounded
   pending queue. When the queue is full, discard the oldest pending visual
   item and keep the newest message.
7. Disabling danmaku removes active DOM items and clears the pending queue.

The stage writes message text through `textContent`, never `innerHTML`, so
chat text cannot become overlay markup. The stage is marked `aria-hidden` and
remains non-interactive.

## 4. Settings Model

Extend `Settings` and normalization with:

```ts
type ChatDanmakuArea = 'quarter' | 'half' | 'threeQuarter' | 'full';
type ChatDanmakuSpeed = 'slow' | 'normal' | 'fast';

interface Settings {
  chatDanmakuEnabled: boolean;
  chatDanmakuArea: ChatDanmakuArea;
  chatDanmakuSpeed: ChatDanmakuSpeed;
  chatDanmakuSizePx: number;
  chatDanmakuOpacity: number;
}
```

The fields use defaults and bounds in shared settings normalization. Invalid
or missing values fall back to the defaults. Existing settings files remain
compatible without a migration prompt.

`OverlaySettings` includes these five fields. The existing main-process
settings change listener continues to update all overlay windows through
`OverlayManager.updateSettings`.

## 5. Failure and Safety Behavior

- A malformed or untrusted chat event cannot reach the overlay because only
  `RoomManager` emits the in-process event after normal validation.
- The overlay never creates one DOM node per unbounded message. Active items
  and pending visual items have hard caps.
- Disabling the setting is immediate and does not disconnect room transports.
- A settings change cannot interrupt the Chat page or change the transcript.
- A renderer animation failure removes only that visual item and leaves chat
  state intact.
- The danmaku stage does not play sound and does not compete with ping/emote
  audio.

## 6. Testing

### Shared settings

- Default danmaku values are present.
- Valid values survive normalization.
- Invalid enums, sizes and opacity values fall back or clamp correctly.
- Existing settings without danmaku fields still normalize successfully.

### RoomManager

- A successful local send emits one live chat event.
- A failed local send emits no live chat event.
- A successful retry emits once with the original message id.
- A validated remote live message emits once.
- Duplicate, unknown-peer, over-limit and malformed messages emit nothing.
- History merge adds transcript messages but emits no danmaku event.

### OverlayManager

- `spawnChatDanmaku` sends `chat:spawn` only to the primary display.
- The payload preserves sender name, colour, id and text.
- No event is sent after the overlay is destroyed.

### Renderer stage

- Items are assigned to tracks without overlap.
- Items are removed after their animation.
- Active and pending caps are enforced.
- Turning danmaku off clears active and pending items.
- Message text is inserted as text, not HTML.

### Manual checks

1. Send a message from one client and confirm it appears once in the sender's
   overlay and once in each other client's overlay.
2. Join a room with existing history and confirm old messages do not float
   again.
3. Toggle danmaku off and confirm current/future visual items disappear while
   Chat continues to send and receive.
4. Change area, speed, size and opacity and confirm new items use the latest
   settings.
5. Send a burst of messages and confirm tracks do not overlap and the overlay
   remains responsive.
6. Test with bright and dark desktop backgrounds, one display and multiple
   displays.

## 7. Out of Scope

- Rendering recovered history as danmaku.
- Displaying danmaku on every monitor.
- Click actions, reply actions, mentions or notification center history.
- Sound, avatars, images, stickers or rich text.
- Separate chat overlay windows.
- Per-member danmaku filters or moderation controls.
- Persistent danmaku history.
