# Heartsteel Room Game Design

## Goal

Add a League of Legends Heartsteel-inspired room mini-game to lolPing-摸鱼搭子. The feature should feel playful and game-like without turning the app into a competitive combat system: room members race to right-click a temporary desktop target, the winner plays the Heartsteel sound, gets a damage pop-up, and permanently increases their own maximum health.

## Product Scope

- The feature lives in rooms. It is unavailable while not in a room.
- Any active room member can turn the Heartsteel game on or off. The switch state is shared with everyone in the room.
- Each user has their own persistent Heartsteel progress. It follows the user across rooms and app restarts.
- Base maximum health is `1000`.
- Saved progress should be `heartsteelBonusHealth`, default `0`.
- Displayed maximum health is `1000 + heartsteelBonusHealth`.
- Heartsteel stacks equal `heartsteelBonusHealth`, matching the item corner-stack feel.
- Hitting a target never reduces another player's health. The damage number is a League-style hit effect and the clicker's growth calculation.

## Gameplay

When Heartsteel is enabled in an active room:

1. Every 3 seconds, a Heartsteel target may spawn on a random display position.
2. The same target is shown to every member.
3. The target stays visible for a short fixed lifetime, then expires if nobody hits it.
4. Members race to right-click the target.
5. The first valid hit wins the target. Late hits for the same target are ignored.
6. The winner gains permanent bonus max health.
7. Everyone sees the hit feedback with the winner, damage, and bonus health gained.

Use integer math:

```ts
damage = Math.round(125 + maxHealth * 0.06)
bonusGain = Math.round(damage * 0.1)
maxHealth = 1000 + heartsteelBonusHealth
```

At the starting `1000` max health, the first hit deals `185` damage and grants `19` bonus max health.

## Room Synchronization

The room has no server, so one current member acts as the temporary target scheduler.

- Elect the scheduler deterministically as the active member with the lowest peer id, including self.
- If the scheduler leaves, everyone recomputes and the new lowest peer id continues scheduling.
- Only the scheduler creates target spawn messages.
- Any member may send a claim message for the current target.
- The current scheduler accepts the first valid claim it sees and broadcasts the final hit message.
- Every client validates that the final hit target id is currently active and not already resolved before applying the result.
- The winner's new `heartsteelBonusHealth` is included in later presence messages so room member health bars stay current.

This approach avoids adding a room owner concept and keeps the feature resilient when people join or leave.

## Data Model

Shared settings should gain:

- `heartsteelBonusHealth: number`

Room member state should expose each member's current Heartsteel data:

- `heartsteelBonusHealth`
- derived `heartsteelMaxHealth`

Transient room/game state should track:

- whether Heartsteel is enabled for this room session
- the active target id, display number, x/y fractions, created time, and expiry time
- whether that target has already been hit
- the latest hit feedback event

The target position should use the same display-number plus normalized x/y model as room pings, so mixed-display setups map cleanly across machines.

## Protocol

Add compatible room message types:

- `heartsteelState`: announces enabled or disabled.
- `heartsteelTarget`: announces a target id, display number, normalized x/y, created timestamp, and expiry timestamp.
- `heartsteelClaim`: announces that the sender right-clicked the current target.
- `heartsteelHit`: scheduler-authored final result with target id, winner peer, damage, bonus gain, and winner bonus health after the hit.

Older app versions will ignore unknown message types after protocol support is added. If the change requires strict compatibility checks, bump the room protocol version and show the existing "needs update" badge.

## Desktop Overlay

The overlay gains a Heartsteel layer above pings/emotes/chat. It renders:

- a pulsing Heartsteel target based on `assets/心之钢效果参考图.png`
- hit feedback at the target position
- the Heartsteel sound from `assets/sounds/心之钢音效.mp3`

The target should be recreated programmatically with CSS or Canvas rather than relying on the tiny reference image as a direct sprite: blue-gray circular aura, red glowing center, soft pulse, and a clear clickable core.

Interaction should be conservative:

- The overlay remains click-through when no target is active.
- While a target is active, use Electron `BrowserWindow.setShape()` on Windows so only a small target hit rectangle receives mouse events; the rest of the desktop remains usable.
- Right-click is the required hit action.
- Clicking works with any current system cursor.
- When the Summoner cursor skin is active, the target hover cursor should match the selected pack:
  - modern pack: use the precision/crosshair style, currently `assets/cursors/summoner/crosshair.cur`
  - classic pack: use the text/precision-style cursor, preferably `assets/cursors/summoner-classic/text.cur` unless visual testing shows `precision.cur` better matches the intended feel

## Settings UI

The Room page should add a Heartsteel control and status area:

- A switch or button labeled as the Heartsteel room game.
- The switch is enabled only in an active room.
- Any member can toggle it, and the change syncs to the room.
- The room member list should show each member's League-style health bar.
- Each member row should show the Heartsteel item icon from `assets/心之钢装备图.png`.
- The item icon should show the stack number in the bottom-right corner, where stack number is `heartsteelBonusHealth`.

The health bar should be compact and scannable:

- dark metal frame
- red health fill
- subtle segment ticks like League health bars
- numeric max health text
- Heartsteel item icon with a small readable stack badge

## Assets

The user-provided assets currently exist in the root checkout and must be copied into the develop worktree before implementation:

- `D:\cc_workspace\lolping\assets\心之钢效果参考图.png`
- `D:\cc_workspace\lolping\assets\心之钢装备图.png`
- `D:\cc_workspace\lolping\assets\sounds\心之钢音效.mp3`

Use ASCII aliases in code where practical if URL or packaging behavior around Chinese filenames becomes brittle. The user-facing feature can still use Chinese text.

## Error Handling

- If the sound is missing, the hit should still resolve and visual feedback should still show. The About page can list the missing asset through the existing missing-assets mechanism.
- If the target click IPC arrives after expiry or after another winner, ignore it.
- If a non-scheduler receives a claim, ignore it; only the scheduler can turn a claim into a final hit.
- If the scheduler changes during a visible target, keep the current target until it resolves or expires; the new scheduler starts future targets.
- If a user leaves the room, their local persistent bonus health remains unchanged.

## Testing

Focused tests should cover:

- settings normalization and persistence for `heartsteelBonusHealth`
- damage and bonus-gain calculation
- scheduler election from room members
- target spawn/hit/expiry state transitions
- duplicate hit suppression
- presence/state exposure of member Heartsteel health
- overlay hit reporting only for right-click target hits
- Room UI health bar and item stack rendering

Manual verification should include:

- two local clients in the same room seeing the same target
- both clients racing to click, with only one winner
- quitting and rejoining with the winner's stacks preserved
- packaged build includes the Heartsteel sound and item/reference assets
- the red target does not block desktop clicks outside its small hit region

