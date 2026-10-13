# Room Chat Transcript Polish Design

**Date:** 2026-10-13
**Status:** Approved
**Builds on:** `docs/superpowers/specs/2026-10-12-room-chat-design.md`

## Goal

Make the plain-text room chat transcript easier to scan while keeping the
existing lightweight reliable send and retry behavior.

## User Experience

- Each message shows the sender name on its own line above the bubble.
- The sender label ends with a colon, for example `Alex:`.
- The message body is the only normal content inside the bubble.
- Successful and in-progress local send states have no visible status label.
- A failed local message shows a small red exclamation icon beside its bubble.
- Clicking the red exclamation retries the same message through the existing
  retry path.
- A successful retry removes the failure icon automatically.
- The timestamp is hidden by default and appears as muted text beside the
  bubble while the pointer is over the message row.
- The message row is keyboard-focusable for the same timestamp reveal and
  retry affordance remains an accessible labelled button.
- Remote messages never show a retry icon.

## Implementation

`RoomChatMessage.status` remains unchanged in the shared model because the
main process still needs to distinguish failed messages from successful
messages. The renderer stops translating `sending` and `sent` into visible
copy and only renders the failure affordance for a local message with
`status === 'failed'`.

`ChatMessage` is reorganized into:

```text
message row
  sender label
  message line
    message bubble
    optional failure retry button
    hover-only timestamp
```

The existing member lookup continues to provide the current name and tag
colour for old messages after a rename. The message text remains plain React
text content, so no rich-text or markup behavior is introduced.

## Styling

- Incoming messages remain left aligned.
- Local messages remain right aligned.
- Sender and timestamp use the existing muted/tag colour system.
- The failure icon uses the existing warning/error orange-red accent.
- Timestamp transitions from hidden to visible on `.chatMessage:hover` and
  `.chatMessage:focus-within`, without changing layout when hidden.
- The message bubble keeps its current wrapping and multiline behavior.

## Testing

- Add pure renderer helper tests for the colon sender label and retry visibility
  predicate.
- Keep existing RoomManager retry tests unchanged as coverage for the network
  behavior.
- Run focused chat tests, typecheck and production build.
