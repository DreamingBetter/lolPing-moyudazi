# Room Chat - Design Spec

**Date:** 2026-10-12
**Status:** Approved in brainstorming and written spec review
**Target:** Next room milestone
**Builds on:** Existing room sharing, LAN and relay transports, room encryption, settings window navigation.

## 1. Purpose

Add a lightweight group chat to rooms so people who are already connected for shared pings and emotes can also exchange plain text. The chat is a temporary room channel, not a full instant messaging product.

Success criteria:

1. After creating or joining a room, the settings window opens the new Chat page by default.
2. Room members can send and receive plain text messages over the existing encrypted room transports.
3. Chat works independently from ping/emote mute and pause settings.
4. A member who joins while at least one other member is still online can recover the recent room chat history.
5. If everyone leaves, chat history disappears naturally because there is no server or disk persistence.
6. The first version stays small: no private chat, files, images, stickers, reactions, message edits, message deletion, read receipts, delivery counts, search or threads.

## 2. Product Decisions

| Topic | Decision |
|---|---|
| Information architecture | Add a dedicated `Chat` page to the settings window navigation. Keep `Room` for room setup and network/member controls. |
| Default navigation | Creating or joining a room switches the settings window to `Chat`. Opening room settings from the tray still opens `Room`. |
| Message content | Plain text only. Trim before sending. Empty messages are not sent. |
| History model | Online-member relay: each client keeps the latest 200 messages in memory and can provide them to new joiners. |
| Persistence | No disk persistence and no server persistence. Leaving a room clears the local chat cache. |
| History limit | Latest 200 messages. No time limit. |
| Send status | Lightweight reliable UI: `sending`, `sent`, `failed`; no remote ACK, read receipt or delivered count. |
| Mute/pause | Room mute, global pause and per-member mute do not affect chat. They continue to apply only to pings and emotes. |
| Room size | Same room member cap as existing rooms. |

## 3. User Experience

### 3.1 Navigation

The left nav adds `Chat` near `Room`.

States:

- Not in a room: show an empty state with `Create room`, a join-code input, and a link/button to the Room page for advanced settings.
- Joining: show the room code, a joining indicator, and disabled input.
- Active room: show the chat window.

When `createRoom()` or `joinRoom()` succeeds from either the Room page or Chat page, the settings UI switches to `Chat`.

### 3.2 Chat Page

The active Chat page contains:

- Header: room code, member count, copy-code button.
- Message list: chronological messages with sender name, sender colour, timestamp, body and local send status for messages from this client.
- Composer: multiline plain-text input and a send button.
- Failed-message affordance: a small retry action on failed local messages.

Message display rules:

- Local messages appear immediately as `sending`.
- `sent` means the main process accepted the message into the current room session and used any available room routes. If nobody else is present yet, the message can still reach later joiners through history sync while this client remains online.
- `failed` means the message was not handed to the room network layer. The user can retry with the same message ID.
- Incoming messages from muted members are still shown, because per-member mute is for ping/emote noise, not chat moderation.

### 3.3 Room Page

The Room page remains the place for:

- Create/join/leave.
- Room code.
- Member list.
- LAN/internet status.
- Room mute.
- Incoming ping/emote limit.
- Allow internet connections.
- Rejoin last room.
- Display mapping and privacy/help text.

The Room page shows a compact "Open chat" action while active, but it does not embed the chat transcript.

## 4. Architecture

Existing room networking stays in the main process:

```text
settings renderer
  Chat page
    |
    | settings IPC
    v
main process
  RoomManager
    | sealed packets
    +-- LanTransport
    +-- RelayTransport
```

The overlay renderer is not involved. Chat messages are not displayed as overlay toasts and are not tied to wheel interactions.

### 4.1 Shared Types

Add chat-facing state types in `src/shared/roomChat.ts`. Protocol message types stay in `src/shared/roomProtocol.ts`.

```ts
export type ChatSendStatus = 'sending' | 'sent' | 'failed';

export interface RoomChatMessage {
  id: string;
  peer: string;
  name: string;
  color: number;
  ts: number;
  text: string;
  self: boolean;
  status?: ChatSendStatus;
}

export interface RoomChatState {
  phase: 'idle' | 'joining' | 'active';
  code: string | null;
  members: number;
  messages: RoomChatMessage[];
}
```

Renderer state is pushed from main through IPC, as room state is today. The renderer does not synthesize trusted remote messages by itself.

### 4.2 Room Protocol

Extend `RoomMessage` with:

```ts
interface ChatMsg extends Base {
  t: 'chat';
  id: string;
  text: string;
}

interface ChatHistoryRequestMsg extends Base {
  t: 'chatHistoryRequest';
  request: string;
}

interface ChatHistoryMsg extends Base {
  t: 'chatHistory';
  request: string;
  part: number;
  total: number;
  messages: { id: string; peer: string; ts: number; name: string; color: number; text: string }[];
}
```

Validation rules:

- `id` and `request` are 32 lowercase hex characters, generated from 16 random bytes by main.
- `text` is trimmed, must be non-empty, and is limited to 1000 code points.
- A chat packet must also fit the existing 1200-byte sealed room-packet limit after UTF-8 encoding. Text that exceeds the byte budget is rejected as `too-long`, even when it is below the code-point limit.
- Text sanitisation removes C0/C1 control characters, bidi controls, zero-width characters and line/paragraph separators that can hide or reorder UI text. Normal whitespace and newlines are allowed.
- `part` is zero-based, `total` is 1 to 64, and each `part` is less than `total`.
- A history response contains at most 200 messages in total, but is split into as many `chatHistory` packets as needed to fit the existing sealed-packet limit. The receiver merges all parts for the matching request and dedupes by message ID.
- History items from unknown future shapes are dropped item-by-item; a malformed envelope is dropped as today.
- Unknown extra fields are ignored.

Do not bump `PROTOCOL_VERSION` for this first chat version. Older clients drop unknown `chat` messages, and newer clients still exchange pings/emotes with them. The first UI does not add a "chat unavailable" badge for old peers.

### 4.3 Main Process State

`RoomManager` owns:

- `chatMessages`: latest 200 messages in memory for the current join session.
- `pendingLocal`: local messages still in `sending` or `failed`.
- message ID dedupe set for recent chat/history message IDs.

On room start:

- Clear chat state.
- After room keys/transports start, send presence as today.
- Once at least active enough to talk to the room, send `chatHistoryRequest`.

On leave/quit:

- Send `bye` as today.
- Clear chat state.
- Push empty chat state.

On incoming `chat`:

- Require a known member unless the sender is self.
- Do not apply ping/emote mute gates.
- Validate and dedupe by message ID.
- Append to the memory cache.
- Trim cache to 200 messages.
- Push chat state to settings windows.

On incoming `chatHistoryRequest`:

- If in a room, send one `chatHistory` response containing this client's latest 200 cached messages.
- Split the response into packet-sized parts before sealing. Response parts go through the same routing logic as other shared room messages.
- To avoid a joiner getting many duplicate histories, the joiner dedupes by ID. A later optimization can make only one peer answer, but that is not necessary for a room capped at 8 members.

On incoming `chatHistory`:

- Match the `request` ID against a recent local request.
- Validate the part, collect it for the matching request, dedupe each item by message ID, merge available parts, sort by timestamp then stable ID.
- Trim to 200 messages.
- Push chat state.

### 4.4 Sending and Retry

Renderer sends text through new settings IPC, for example `room:chatSend`.

Main creates a local chat message:

- ID: generated by main, stable across retries.
- `peer`: current self peer.
- `name` and `color`: current profile at send time.
- `ts`: current clock.
- `text`: validated and sanitised text.
- `status`: `sending`.

Then main calls a new RoomManager send method.

Status transitions:

- `sending` -> `sent` if the message is accepted into the active room session and packet creation succeeds. Main then sends it over every available live route or shared transport; if no one else is present yet, it remains in the 200-message cache for later history sync.
- `sending` -> `failed` if not active in a room, validation fails, packet creation fails, or every attempted transport send throws.
- Retry keeps the same message ID and text, sets status back to `sending`, and attempts the send again.

Room pause and mute must not intentionally block chat. If existing `sendShared` suppresses all outgoing while paused, chat should use a separate send path or a parameter that bypasses the ping/emote pause gate.

No remote ACK is added in the first version. That keeps the protocol small and honest: `sent` is local network-layer success, not guaranteed delivery.

## 5. IPC

Extend settings IPC with:

- `room:chatGet` -> `RoomChatState`
- `room:chatState` push -> `RoomChatState`
- `room:chatSend(text)` -> `{ ok: true; id: string } | { ok: false; error: string }`
- `room:chatRetry(id)` -> `{ ok: true } | { ok: false; error: string }`

The preload exposes these through `SettingsApi`.

Errors are user-friendly categories, not raw exceptions:

- `not-in-room`
- `empty`
- `too-long`
- `failed`

## 6. Limits and Abuse Handling

The chat feature should preserve the room feature's conservative networking posture.

Limits:

- Max local cache: 200 messages.
- Max text length: 1000 code points.
- Max history payload: 200 messages.
- Max rendered message line wrapping: UI wraps long words and preserves layout.
- Outgoing chat rate: 3 messages per second with a burst of 6, per local client.
- Incoming chat rate: per-peer token bucket, separate from ping/emote limit, 5 messages per second with a burst of 10.

Failure behavior:

- Over-limit local sends fail in UI.
- Over-limit remote messages are dropped silently.
- Malformed messages are dropped silently.
- Chat history that is too large is dropped or item-filtered according to validation.

## 7. Privacy

Chat text is sealed inside the existing end-to-end encrypted room packet envelope.

Relays and LAN observers see timing and packet sizes but not chat text, names or room codes. Other room members can read chat messages. Because history is memory-only, leaving the room clears this client's cache; if another member remains online, they may still provide the recent history to later joiners.

The privacy/help copy should mention that room chat is temporary and recovered from online members, not from a server.

## 8. Testing

Unit tests:

- `tests/shared/roomProtocol.test.ts`
  - Valid and invalid `chat`, `chatHistoryRequest`, `chatHistory`.
  - Text length, empty text, sanitisation, malformed IDs, oversized history.
  - Round trip encode/decode.

- `tests/main/roomManager.test.ts`
  - Sending chat while active.
  - Chat still sends/receives while room is muted, member is muted and app is paused.
  - Failed send when idle or when no route exists.
  - Retry reuses the same ID and dedupes on receivers.
  - Incoming chat from unknown peers is dropped.
  - History request on join.
  - History merge, dedupe, ordering and trim to 200.
  - Leaving clears chat state.

- `tests/main/settingsIpc.test.ts`
  - IPC handlers for get/send/retry.
  - Validation errors.

- Renderer/component tests:
  - Chat empty/joining/active states.
  - Sending clears the composer only on accepted send.
  - Failed message retry action calls IPC.
  - Long text wraps without layout overflow.

Manual checks:

1. Create a room, auto-switch to Chat, send a message.
2. Join from another client, recover existing messages from the first client.
3. Leave and rejoin while someone remains online, recover recent history.
4. Everyone leaves, create/join the same code again, no history appears.
5. Mute room, mute a member and globally disable lolPing; chat still works.
6. Block all routes or force an idle state; local message shows failed and retry works after reconnect.

## 9. Delivery Plan

1. Shared protocol/types and validation.
2. RoomManager chat state, send/retry, history request/response and tests.
3. Settings IPC/preload API.
4. Settings UI navigation and Chat page.
5. Auto-navigation to Chat after successful create/join.
6. i18n strings in English and Chinese.
7. Focused tests and manual dev run.
8. Documentation update if user-facing README text is maintained for room features.

## 10. Out of Scope

- Private messages.
- File, image or folder transfer.
- Emojis, stickers, reactions or rich embeds.
- Message edit/delete/recall.
- Mentions and notifications.
- Read receipts, delivered counts or remote ACKs.
- Search.
- Threads or replies.
- Moderation, kick/ban or per-member chat blocking.
- Server-side or disk-persisted history.
- A separate always-on chat overlay window.
