# Heartsteel Solo Mode Design

## Goal

Make Heartsteel discoverable and playable without creating or joining a room, while preserving the existing multiplayer room race.

## Product Behavior

- The Heartsteel control is always visible on the Room settings page.
- When the user is not in a room, enabling Heartsteel starts a local solo mode.
- When the user is in an active room, enabling Heartsteel keeps using the existing synchronized room mode.
- If the user leaves a room while Heartsteel is enabled, the app returns to local solo mode instead of hiding or stopping the feature.
- Personal Heartsteel progress remains persistent per user. Base max health is `2000`; stacks are the saved bonus health.
- The health bar represents current health, not growth progress. Current health is always full for now, so the bar is always filled.
- The bar uses a League-like green fill with dense health ticks: small ticks every `100` max health and stronger ticks every `1000` max health.

## Technical Notes

- Reuse the current overlay target and hit rendering.
- Keep room scheduling and claim convergence unchanged for active room mode.
- Add a local Heartsteel path in the main process for idle state, using the same target shape, hit math, sound, and persistent bonus health update path.
- Keep desktop overlay hit testing conservative with the existing `setShape()` target hit area.

## Tests

- Shared Heartsteel math starts at `2000` base max health.
- Room state exposes self Heartsteel health even when idle so the UI can render the feature.
- Heartsteel can be enabled while idle and locally schedules/claims targets.
- UI helpers render a full health bar and produce tick density values from max health.
