# Heartsteel Room Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Heartsteel room mini-game with persistent per-user stacks, shared room targets, right-click desktop hits, League-style health bars, and packaged assets.

**Architecture:** Put Heartsteel math and serializable types in shared code, keep room authority in `RoomManager`, and keep desktop interaction in the existing overlay window system. Room members send target claims; the elected scheduler broadcasts the final hit so all clients converge on one winner.

**Tech Stack:** Electron, TypeScript, React settings UI, Vitest, native hook helper unchanged for the first implementation, Electron `BrowserWindow.setShape()` for target hit regions on Windows.

## Global Constraints

- Work in `.worktrees/develop` on branch `develop`.
- The app is Windows-only for active development and releases.
- Keep ping, emote, action wheel, cursor skin, and room chat behavior intact.
- Any active room member can toggle the Heartsteel game for the room.
- Each user has persistent personal Heartsteel progress: base max health is `1000`, saved bonus health starts at `0`, and displayed stacks equal bonus health.
- Hit math is integer based: `damage = Math.round(125 + maxHealth * 0.06)`, `bonusGain = Math.round(damage * 0.1)`.
- Hits add permanent bonus health only to the clicker; no other player's health is reduced.
- Elect the active member with the lowest peer id as the temporary target scheduler.
- Clickers send target claims; only the scheduler broadcasts the final hit.
- Heartsteel desktop targets must not block normal desktop interaction outside the target hit area.
- Copy the user-provided Heartsteel assets from `D:\cc_workspace\lolping\assets` into `.worktrees/develop\assets` before packaging.
- After implementation, run `npm run test`, `npm run typecheck`, `git diff --check`, and `npm run dist`.

---

## File Structure

- `src/shared/heartsteel.ts`: Heartsteel constants, math helpers, ids, serializable target/hit state, and scheduler helper.
- `src/shared/settings.ts`: persistent `heartsteelBonusHealth` setting, normalization, and default.
- `src/shared/room.ts`: room member and room state fields for Heartsteel.
- `src/shared/roomProtocol.ts`: wire message types and validation for Heartsteel state, targets, claims, hits, and presence health.
- `src/main/roomManager.ts`: room scheduler, target lifecycle, claim arbitration, hit application, and events.
- `src/main/index.ts`: connect settings, RoomManager, overlay, and persistent health updates.
- `src/main/settingsIpc.ts`, `src/shared/settingsChannels.ts`, `src/shared/ipc.ts`, `src/preload/settings.ts`: room toggle IPC and overlay hit IPC.
- `src/main/overlayManager.ts`: display mapping, target shape hit region, renderer messages, and overlay claim reports.
- `src/renderer/overlay/heartsteelStage.ts`: target rendering, right-click detection, sound, hit feedback.
- `src/renderer/overlay/main.ts`, `src/renderer/overlay/overlay.css`, `src/preload/overlay.ts`: wire overlay stage and channels.
- `src/renderer/settings/heartsteelView.ts`: testable display helpers for health text, stack text, and percent fill.
- `src/renderer/settings/components/RoomSection.tsx`: switch, health bars, item stack icon in the room UI.
- `src/shared/i18n.ts`: Heartsteel UI strings in English and Chinese.
- `assets/heartsteel/item.png`, `assets/heartsteel/target-reference.png`, `assets/sounds/heartsteel.mp3`: packaged assets copied from the user-provided files.

---

### Task 1: Shared Heartsteel Math And Persistent Setting

**Files:**
- Create: `src/shared/heartsteel.ts`
- Modify: `src/shared/settings.ts`
- Test: `tests/shared/heartsteel.test.ts`
- Test: `tests/shared/settings.test.ts`

**Interfaces:**
- Produces:
  - `HEARTSTEEL_BASE_HEALTH = 1000`
  - `HEARTSTEEL_BONUS_MAX = 999999`
  - `HEARTSTEEL_TARGET_INTERVAL_MS = 3000`
  - `HEARTSTEEL_TARGET_TTL_MS = 2400`
  - `HEARTSTEEL_TARGET_HIT_RADIUS_PX = 48`
  - `type HeartsteelHitResult = { damage: number; bonusGain: number }`
  - `normalizeHeartsteelBonusHealth(raw: unknown): number`
  - `heartsteelMaxHealth(bonusHealth: number): number`
  - `heartsteelStacks(bonusHealth: number): number`
  - `calculateHeartsteelHit(maxHealth: number): HeartsteelHitResult`
  - `calculateHeartsteelHitFromBonus(bonusHealth: number): HeartsteelHitResult`
  - `isHeartsteelTargetId(value: unknown): value is string`
  - `heartsteelSchedulerPeer(peers: readonly string[]): string | null`
- Updates `Settings` with `heartsteelBonusHealth: number`.

- [ ] **Step 1: Write the failing Heartsteel math tests**

Create `tests/shared/heartsteel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  HEARTSTEEL_BASE_HEALTH,
  calculateHeartsteelHit,
  calculateHeartsteelHitFromBonus,
  heartsteelMaxHealth,
  heartsteelSchedulerPeer,
  heartsteelStacks,
  isHeartsteelTargetId,
  normalizeHeartsteelBonusHealth,
} from '../../src/shared/heartsteel';

describe('heartsteel math', () => {
  it('starts at 1000 max health and uses integer Heartsteel hit math', () => {
    expect(HEARTSTEEL_BASE_HEALTH).toBe(1000);
    expect(heartsteelMaxHealth(0)).toBe(1000);
    expect(heartsteelStacks(19)).toBe(19);
    expect(calculateHeartsteelHit(1000)).toEqual({ damage: 185, bonusGain: 19 });
    expect(calculateHeartsteelHitFromBonus(19)).toEqual({ damage: 186, bonusGain: 19 });
  });

  it('normalizes saved bonus health to a safe integer stack value', () => {
    expect(normalizeHeartsteelBonusHealth(undefined)).toBe(0);
    expect(normalizeHeartsteelBonusHealth(-5)).toBe(0);
    expect(normalizeHeartsteelBonusHealth(12.6)).toBe(13);
    expect(normalizeHeartsteelBonusHealth(1_500_000)).toBe(999999);
    expect(normalizeHeartsteelBonusHealth('20')).toBe(0);
  });

  it('validates target ids and elects the lowest peer id as scheduler', () => {
    expect(isHeartsteelTargetId('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isHeartsteelTargetId('ABC')).toBe(false);
    expect(heartsteelSchedulerPeer(['bbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaa', 'cccccccccccccccc'])).toBe('aaaaaaaaaaaaaaaa');
    expect(heartsteelSchedulerPeer([])).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing settings normalization tests**

Append to `tests/shared/settings.test.ts`:

```ts
describe('heartsteel settings', () => {
  it('persists a normalized personal Heartsteel bonus health value', () => {
    expect(DEFAULT_SETTINGS.heartsteelBonusHealth).toBe(0);
    expect(normalizeSettings({}).heartsteelBonusHealth).toBe(0);
    expect(normalizeSettings({ heartsteelBonusHealth: 42 }).heartsteelBonusHealth).toBe(42);
    expect(normalizeSettings({ heartsteelBonusHealth: 42.8 }).heartsteelBonusHealth).toBe(43);
    expect(normalizeSettings({ heartsteelBonusHealth: -1 }).heartsteelBonusHealth).toBe(0);
    expect(normalizeSettings({ heartsteelBonusHealth: '99' }).heartsteelBonusHealth).toBe(0);
  });
});
```

- [ ] **Step 3: Run red tests**

Run:

```powershell
npm run test -- tests/shared/heartsteel.test.ts tests/shared/settings.test.ts
```

Expected: `heartsteel.test.ts` fails because `src/shared/heartsteel.ts` does not exist, and `settings.test.ts` fails because `heartsteelBonusHealth` is not in settings.

- [ ] **Step 4: Implement shared helpers and setting normalization**

Create `src/shared/heartsteel.ts`:

```ts
export const HEARTSTEEL_BASE_HEALTH = 1000;
export const HEARTSTEEL_BONUS_MAX = 999_999;
export const HEARTSTEEL_TARGET_INTERVAL_MS = 3000;
export const HEARTSTEEL_TARGET_TTL_MS = 2400;
export const HEARTSTEEL_TARGET_HIT_RADIUS_PX = 48;

export interface HeartsteelHitResult {
  damage: number;
  bonusGain: number;
}

export function normalizeHeartsteelBonusHealth(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.min(HEARTSTEEL_BONUS_MAX, Math.max(0, Math.round(raw)));
}

export function heartsteelMaxHealth(bonusHealth: number): number {
  return HEARTSTEEL_BASE_HEALTH + normalizeHeartsteelBonusHealth(bonusHealth);
}

export function heartsteelStacks(bonusHealth: number): number {
  return normalizeHeartsteelBonusHealth(bonusHealth);
}

export function calculateHeartsteelHit(maxHealth: number): HeartsteelHitResult {
  const safeMaxHealth = Math.max(HEARTSTEEL_BASE_HEALTH, Math.round(maxHealth));
  const damage = Math.round(125 + safeMaxHealth * 0.06);
  return { damage, bonusGain: Math.round(damage * 0.1) };
}

export function calculateHeartsteelHitFromBonus(bonusHealth: number): HeartsteelHitResult {
  return calculateHeartsteelHit(heartsteelMaxHealth(bonusHealth));
}

export function isHeartsteelTargetId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}

export function heartsteelSchedulerPeer(peers: readonly string[]): string | null {
  return peers.length === 0 ? null : [...peers].sort()[0];
}
```

Modify `src/shared/settings.ts`:

```ts
import { normalizeHeartsteelBonusHealth } from './heartsteel';
```

Add `heartsteelBonusHealth: number` to `Settings`, set `DEFAULT_SETTINGS.heartsteelBonusHealth = 0`, and return:

```ts
heartsteelBonusHealth: normalizeHeartsteelBonusHealth(r.heartsteelBonusHealth),
```

- [ ] **Step 5: Run green tests**

Run:

```powershell
npm run test -- tests/shared/heartsteel.test.ts tests/shared/settings.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/heartsteel.ts src/shared/settings.ts tests/shared/heartsteel.test.ts tests/shared/settings.test.ts
git commit -m "Add Heartsteel shared state"
```

---

### Task 2: Room Protocol And Room State Types

**Files:**
- Modify: `src/shared/heartsteel.ts`
- Modify: `src/shared/room.ts`
- Modify: `src/shared/roomProtocol.ts`
- Test: `tests/shared/roomProtocol.test.ts`

**Interfaces:**
- Produces shared state types:
  - `type HeartsteelCursorKind = 'system' | 'modern' | 'classic'`
  - `interface HeartsteelTarget { id: string; d: number; x: number; y: number; createdAt: number; expiresAt: number }`
  - `interface HeartsteelHit { id: string; winner: string; winnerName: string; winnerColor: number; damage: number; bonusGain: number; bonusHealth: number; maxHealth: number; ts: number }`
  - `interface HeartsteelRoomState { enabled: boolean; target: HeartsteelTarget | null; lastHit: HeartsteelHit | null }`
- Updates `RoomMember` with `heartsteelBonusHealth` and `heartsteelMaxHealth`.
- Updates `RoomStateCore` with `heartsteel: HeartsteelRoomState`.
- Produces protocol messages:
  - `HeartsteelStateMsg`
  - `HeartsteelTargetMsg`
  - `HeartsteelClaimMsg`
  - `HeartsteelHitMsg`

- [ ] **Step 1: Write failing protocol tests**

Update `tests/shared/roomProtocol.test.ts` imports:

```ts
import type {
  HeartsteelClaimMsg,
  HeartsteelHitMsg,
  HeartsteelStateMsg,
  HeartsteelTargetMsg,
} from '../../src/shared/roomProtocol';
```

Add fixtures near the existing message fixtures:

```ts
const heartsteelState: HeartsteelStateMsg = { ...base, t: 'heartsteelState', enabled: true };
const heartsteelTarget: HeartsteelTargetMsg = {
  ...base,
  t: 'heartsteelTarget',
  id: '11111111111111111111111111111111',
  d: 1,
  x: 0.25,
  y: 0.75,
  createdAt: base.ts,
  expiresAt: base.ts + 2400,
};
const heartsteelClaim: HeartsteelClaimMsg = { ...base, t: 'heartsteelClaim', id: heartsteelTarget.id };
const heartsteelHit: HeartsteelHitMsg = {
  ...base,
  t: 'heartsteelHit',
  id: heartsteelTarget.id,
  winner: base.peer,
  damage: 185,
  bonusGain: 19,
  bonusHealth: 19,
};
```

Extend the round-trip test:

```ts
it.each<RoomMessage>([
  presence,
  ping,
  emote,
  chat,
  historyRequest,
  history,
  heartsteelState,
  heartsteelTarget,
  heartsteelClaim,
  heartsteelHit,
  { ...base, t: 'bye' },
])('round-trips $t', (m) => {
  expect(decodeMessage(encodeMessage(m))).toEqual(m);
});
```

Add validation tests:

```ts
describe('heartsteel messages', () => {
  it('accepts optional Heartsteel bonus health on presence', () => {
    expect(validateMessage({ ...presence, heartsteelBonusHealth: 42 })).toEqual({ ...presence, heartsteelBonusHealth: 42 });
    expect(validateMessage({ ...presence, heartsteelBonusHealth: -1 })).toEqual(presence);
    expect(validateMessage({ ...presence, heartsteelBonusHealth: '42' })).toEqual(presence);
  });

  it.each([
    ['state enabled not boolean', { ...heartsteelState, enabled: 'yes' }],
    ['target invalid id', { ...heartsteelTarget, id: 'bad' }],
    ['target display 0', { ...heartsteelTarget, d: 0 }],
    ['target x outside unit', { ...heartsteelTarget, x: 1.1 }],
    ['target expires before create', { ...heartsteelTarget, expiresAt: heartsteelTarget.createdAt }],
    ['claim invalid id', { ...heartsteelClaim, id: 'bad' }],
    ['hit winner invalid', { ...heartsteelHit, winner: 'bad' }],
    ['hit negative damage', { ...heartsteelHit, damage: -1 }],
    ['hit negative bonus', { ...heartsteelHit, bonusGain: -1 }],
    ['hit negative bonus health', { ...heartsteelHit, bonusHealth: -1 }],
  ])('rejects %s', (_label, raw) => {
    expect(validateMessage(raw)).toBeNull();
  });
});
```

- [ ] **Step 2: Run red tests**

Run:

```powershell
npm run test -- tests/shared/roomProtocol.test.ts
```

Expected: TypeScript or Vitest fails because the Heartsteel protocol types do not exist.

- [ ] **Step 3: Add shared room types**

Add to `src/shared/heartsteel.ts`:

```ts
export type HeartsteelCursorKind = 'system' | 'modern' | 'classic';

export interface HeartsteelTarget {
  id: string;
  d: number;
  x: number;
  y: number;
  createdAt: number;
  expiresAt: number;
}

export interface HeartsteelHit {
  id: string;
  winner: string;
  winnerName: string;
  winnerColor: number;
  damage: number;
  bonusGain: number;
  bonusHealth: number;
  maxHealth: number;
  ts: number;
}

export interface HeartsteelRoomState {
  enabled: boolean;
  target: HeartsteelTarget | null;
  lastHit: HeartsteelHit | null;
}
```

Modify `src/shared/room.ts`:

```ts
import type { HeartsteelRoomState } from './heartsteel';
```

Add to `RoomMember`:

```ts
heartsteelBonusHealth: number;
heartsteelMaxHealth: number;
```

Add to `RoomStateCore`:

```ts
heartsteel: HeartsteelRoomState;
```

- [ ] **Step 4: Add protocol validation**

Modify `src/shared/roomProtocol.ts`:

```ts
import {
  HEARTSTEEL_BONUS_MAX,
  calculateHeartsteelHit,
  isHeartsteelTargetId,
  normalizeHeartsteelBonusHealth,
} from './heartsteel';
```

Extend `PresenceMsg`:

```ts
heartsteelBonusHealth?: number;
```

Add message interfaces:

```ts
export interface HeartsteelStateMsg extends Base {
  t: 'heartsteelState';
  enabled: boolean;
}

export interface HeartsteelTargetMsg extends Base {
  t: 'heartsteelTarget';
  id: string;
  d: number;
  x: number;
  y: number;
  createdAt: number;
  expiresAt: number;
}

export interface HeartsteelClaimMsg extends Base {
  t: 'heartsteelClaim';
  id: string;
}

export interface HeartsteelHitMsg extends Base {
  t: 'heartsteelHit';
  id: string;
  winner: string;
  damage: number;
  bonusGain: number;
  bonusHealth: number;
}
```

Extend `RoomMessage` with the new interfaces.

In the `presence` branch, add the optional field only when it is valid:

```ts
const bonus = normalizeHeartsteelBonusHealth(raw.heartsteelBonusHealth);
return bonus > 0
  ? { t, ...base, proto, app, name: sanitizeName(name.slice(0, 256)), color, status: status as MemberStatus, heartsteelBonusHealth: bonus }
  : { t, ...base, proto, app, name: sanitizeName(name.slice(0, 256)), color, status: status as MemberStatus };
```

Add validation branches for the new message types. `heartsteelHit` should accept only values consistent with the published math:

```ts
case 'heartsteelState': {
  const { enabled } = raw;
  return typeof enabled === 'boolean' ? { t, ...base, enabled } : null;
}
case 'heartsteelTarget': {
  const { id, d, x, y, createdAt, expiresAt } = raw;
  if (!isHeartsteelTargetId(id) || !Number.isInteger(d) || (d as number) < 1 || (d as number) > MAX_DISPLAY) return null;
  if (!isUnit(x) || !isUnit(y) || !isUint(createdAt) || !isUint(expiresAt) || expiresAt <= createdAt) return null;
  return { t, ...base, id, d: d as number, x, y, createdAt, expiresAt };
}
case 'heartsteelClaim': {
  const { id } = raw;
  return isHeartsteelTargetId(id) ? { t, ...base, id } : null;
}
case 'heartsteelHit': {
  const { id, winner, damage, bonusGain, bonusHealth } = raw;
  if (!isHeartsteelTargetId(id) || typeof winner !== 'string' || !/^[0-9a-f]{16}$/.test(winner)) return null;
  if (!isUint(damage) || !isUint(bonusGain) || !isUint(bonusHealth) || bonusHealth > HEARTSTEEL_BONUS_MAX) return null;
  const previousBonus = Math.max(0, (bonusHealth as number) - (bonusGain as number));
  const expected = calculateHeartsteelHit(1000 + previousBonus);
  if (expected.damage !== damage || expected.bonusGain !== bonusGain) return null;
  return { t, ...base, id, winner, damage, bonusGain, bonusHealth };
}
```

- [ ] **Step 5: Run green tests**

Run:

```powershell
npm run test -- tests/shared/roomProtocol.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/heartsteel.ts src/shared/room.ts src/shared/roomProtocol.ts tests/shared/roomProtocol.test.ts
git commit -m "Add Heartsteel room protocol"
```

---

### Task 3: RoomManager Heartsteel State And Target Scheduling

**Files:**
- Modify: `src/main/roomManager.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/roomManager.test.ts`

**Interfaces:**
- Consumes: `HeartsteelTarget`, `HeartsteelRoomState`, `heartsteelSchedulerPeer`, `HEARTSTEEL_TARGET_INTERVAL_MS`, `HEARTSTEEL_TARGET_TTL_MS`.
- Produces:
  - `RoomDeps.profile(): { name: string; color: number; limit: number; heartsteelBonusHealth: number }`
  - `RoomDeps.displayNumbers(): readonly number[]`
  - `RoomManager.setHeartsteelEnabled(on: boolean): void`
  - room event `'heartsteelTarget'` with `HeartsteelTarget`
  - room event `'heartsteelClear'` with `{ id: string } | null`

- [ ] **Step 1: Write failing RoomManager scheduling tests**

In `tests/main/roomManager.test.ts`, update the default test profile:

```ts
profile = { name: 'Me', color: 1, limit: 5, heartsteelBonusHealth: 0 };
```

Update `RoomManager` test construction:

```ts
displayNumbers: () => [1, 2],
```

Add arrays in the test setup:

```ts
let heartsteelTargets: HeartsteelTarget[];
let heartsteelClears: Array<{ id: string } | null>;
```

Register events in `beforeEach`:

```ts
heartsteelTargets = [];
heartsteelClears = [];
room.on('heartsteelTarget', (t: HeartsteelTarget) => heartsteelTargets.push(t));
room.on('heartsteelClear', (t: { id: string } | null) => heartsteelClears.push(t));
```

Add tests:

```ts
describe('heartsteel room state', () => {
  it('shows personal Heartsteel health on members and starts disabled', async () => {
    profile.heartsteelBonusHealth = 57;
    await joinActive();
    const state = room.state();
    expect(state.heartsteel).toEqual({ enabled: false, target: null, lastHit: null });
    expect(state.members[0]).toMatchObject({
      self: true,
      heartsteelBonusHealth: 57,
      heartsteelMaxHealth: 1057,
    });
  });

  it('syncs the Heartsteel enabled state to room members', async () => {
    await joinActive();
    room.setHeartsteelEnabled(true);
    expect(room.state().heartsteel.enabled).toBe(true);
    expect(sentMessages('*').at(-1)).toMatchObject({ t: 'heartsteelState', enabled: true });
    room.setHeartsteelEnabled(false);
    expect(room.state().heartsteel.enabled).toBe(false);
    expect(room.state().heartsteel.target).toBeNull();
  });

  it('only the lowest peer id schedules targets every 3 seconds', async () => {
    await joinActive();
    room.setHeartsteelEnabled(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(heartsteelTargets).toHaveLength(1);
    expect(sentMessages('*').at(-1)).toMatchObject({ t: 'heartsteelTarget', id: heartsteelTargets[0].id });

    const lower = new Remote('0000000000000001', 'lan:lower', lan);
    lower.presence();
    await vi.advanceTimersByTimeAsync(3000);
    expect(heartsteelTargets).toHaveLength(1);
  });

  it('expires an unclaimed target and schedules the next one', async () => {
    await joinActive();
    room.setHeartsteelEnabled(true);
    await vi.advanceTimersByTimeAsync(3000);
    const first = heartsteelTargets[0];
    await vi.advanceTimersByTimeAsync(2401);
    expect(heartsteelClears.at(-1)).toEqual({ id: first.id });
    expect(room.state().heartsteel.target).toBeNull();
    await vi.advanceTimersByTimeAsync(600);
    expect(heartsteelTargets).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run red tests**

Run:

```powershell
npm run test -- tests/main/roomManager.test.ts
```

Expected: compile failures for missing `heartsteel` fields and missing `setHeartsteelEnabled`.

- [ ] **Step 3: Implement state, scheduler election, and target lifecycle**

Modify `src/main/roomManager.ts`:

- Import Heartsteel helpers and types.
- Extend `RoomDeps.profile()` and add `displayNumbers()`.
- Add private fields:

```ts
private heartsteelEnabled = false;
private heartsteelTarget: HeartsteelTarget | null = null;
private heartsteelLastHit: HeartsteelHit | null = null;
private nextHeartsteelSpawnAt = 0;
private resolvedHeartsteelTargets = new Set<string>();
```

- Include self/member Heartsteel fields in `state()`.
- Include `heartsteel: { enabled, target, lastHit }` in `RoomStateCore`.
- Add `setHeartsteelEnabled(on: boolean): void`.
- Send `heartsteelState` through `sendShared`.
- In `tick()`, call `this.tickHeartsteel(now)`.
- Implement scheduler helpers:

```ts
private heartsteelPeers(): string[] {
  return [this.self, ...this.members.keys()];
}

private isHeartsteelScheduler(): boolean {
  return heartsteelSchedulerPeer(this.heartsteelPeers()) === this.self;
}
```

- Implement target creation using `randomBytes(16)` for id and random bytes for display/x/y:

```ts
private newHeartsteelTarget(now: number): HeartsteelTarget {
  const id = toHex(this.deps.randomBytes(16));
  const displays = this.deps.displayNumbers();
  const display = displays.length > 0 ? displays[this.deps.randomBytes(1)[0] % displays.length] : 1;
  const bytes = this.deps.randomBytes(4);
  const unit = (hi: number, lo: number) => 0.08 + (((hi << 8) | lo) / 0xffff) * 0.84;
  return { id, d: display, x: unit(bytes[0], bytes[1]), y: unit(bytes[2], bytes[3]), createdAt: now, expiresAt: now + HEARTSTEEL_TARGET_TTL_MS };
}
```

- On target expiry, clear it, emit `'heartsteelClear'`, and set the next spawn time so the 3-second rhythm continues.
- Clear target and emit state when disabling the game.

Modify `src/main/index.ts` RoomManager construction:

```ts
profile: () => ({
  name: settings.displayName,
  color: settings.tagColor,
  limit: settings.incomingPingLimit,
  heartsteelBonusHealth: settings.heartsteelBonusHealth,
}),
displayNumbers: () => overlays.numbered().map((d) => d.number),
```

- [ ] **Step 4: Run green tests**

Run:

```powershell
npm run test -- tests/main/roomManager.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/main/roomManager.ts src/main/index.ts tests/main/roomManager.test.ts
git commit -m "Schedule Heartsteel room targets"
```

---

### Task 4: Heartsteel Claims, Authoritative Hits, And Persistent Bonus Updates

**Files:**
- Modify: `src/main/roomManager.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/roomManager.test.ts`

**Interfaces:**
- Consumes: Task 3 target lifecycle.
- Produces:
  - `RoomManager.claimHeartsteelTarget(id: string): void`
  - room event `'heartsteelHit'` with `HeartsteelHit`
  - room event `'heartsteelBonusHealth'` with `number`
  - Scheduler-authored `heartsteelHit` protocol messages.

- [ ] **Step 1: Write failing claim and hit tests**

Append to the Heartsteel `describe` in `tests/main/roomManager.test.ts`:

```ts
it('scheduler turns the first valid claim into one final hit and local bonus gain', async () => {
  profile.heartsteelBonusHealth = 0;
  const hits: HeartsteelHit[] = [];
  const bonusUpdates: number[] = [];
  room.on('heartsteelHit', (h: HeartsteelHit) => hits.push(h));
  room.on('heartsteelBonusHealth', (n: number) => bonusUpdates.push(n));

  await joinActive();
  room.setHeartsteelEnabled(true);
  await vi.advanceTimersByTimeAsync(3000);
  const target = heartsteelTargets[0];

  room.claimHeartsteelTarget(target.id);

  expect(hits).toEqual([
    expect.objectContaining({
      id: target.id,
      winner: SELF,
      winnerName: 'Me',
      winnerColor: 1,
      damage: 185,
      bonusGain: 19,
      bonusHealth: 19,
      maxHealth: 1019,
    }),
  ]);
  expect(bonusUpdates).toEqual([19]);
  expect(room.state().heartsteel.target).toBeNull();
  expect(sentMessages('*').filter((m) => m.t === 'heartsteelHit')).toHaveLength(1);

  room.claimHeartsteelTarget(target.id);
  expect(hits).toHaveLength(1);
});

it('non-schedulers broadcast a claim and wait for the scheduler hit', async () => {
  await joinActive();
  const lower = new Remote('0000000000000001', 'lan:lower', lan);
  lower.presence();
  lower.state(true);
  lower.target('22222222222222222222222222222222', 1, 0.4, 0.5, Date.now(), Date.now() + 2400);

  room.claimHeartsteelTarget('22222222222222222222222222222222');

  expect(sentMessages('lan:lower').at(-1)).toMatchObject({ t: 'heartsteelClaim', id: '22222222222222222222222222222222' });
  lower.hit('22222222222222222222222222222222', SELF, 185, 19, 19);
  expect(room.state().members[0]).toMatchObject({ heartsteelBonusHealth: 19, heartsteelMaxHealth: 1019 });
});

it('scheduler resolves the first remote claim only', async () => {
  const hits: HeartsteelHit[] = [];
  room.on('heartsteelHit', (h: HeartsteelHit) => hits.push(h));
  await joinActive();
  const alex = new Remote('1111111111111111', 'lan:alex', lan);
  const ben = new Remote('2222222222222222', 'lan:ben', lan);
  alex.presence({ heartsteelBonusHealth: 50 });
  ben.presence({ heartsteelBonusHealth: 0 });
  room.setHeartsteelEnabled(true);
  await vi.advanceTimersByTimeAsync(3000);
  const target = heartsteelTargets[0];

  alex.claim(target.id);
  ben.claim(target.id);

  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ winner: alex.peer, damage: 188, bonusGain: 19, bonusHealth: 69 });
  expect(sentMessages('lan:alex').filter((m) => m.t === 'heartsteelHit')).toHaveLength(1);
});
```

Add helper methods to the `Remote` class in the test:

```ts
state(enabled: boolean): void {
  this.lan.deliver(this.key, this.packet({ t: 'heartsteelState', enabled }));
}
target(id: string, d: number, x: number, y: number, createdAt: number, expiresAt: number): void {
  this.lan.deliver(this.key, this.packet({ t: 'heartsteelTarget', id, d, x, y, createdAt, expiresAt }));
}
claim(id: string): void {
  this.lan.deliver(this.key, this.packet({ t: 'heartsteelClaim', id }));
}
hit(id: string, winner: string, damage: number, bonusGain: number, bonusHealth: number): void {
  this.lan.deliver(this.key, this.packet({ t: 'heartsteelHit', id, winner, damage, bonusGain, bonusHealth }));
}
```

- [ ] **Step 2: Run red tests**

Run:

```powershell
npm run test -- tests/main/roomManager.test.ts
```

Expected: failures for missing `claimHeartsteelTarget`, missing remote helpers support, or no hit events.

- [ ] **Step 3: Implement claim arbitration and hit application**

Modify `src/main/roomManager.ts`:

- Add `claimHeartsteelTarget(id: string): void`.
- If local self is scheduler, call a private `acceptHeartsteelClaim(this.self, id)`.
- If not scheduler, send `heartsteelClaim`.
- In `onPacket`, route:
  - `heartsteelState` to update enabled state
  - `heartsteelTarget` to accept scheduler target
  - `heartsteelClaim` to scheduler-only claim acceptance
  - `heartsteelHit` to final hit application
- Implement claim acceptance:

```ts
private acceptHeartsteelClaim(winner: string, id: string): void {
  if (!this.heartsteelTarget || this.heartsteelTarget.id !== id || this.deps.now() > this.heartsteelTarget.expiresAt) return;
  if (this.resolvedHeartsteelTargets.has(id)) return;
  const profile = winner === this.self ? this.deps.profile() : null;
  const member = winner === this.self ? null : this.members.get(winner);
  const bonusBefore = winner === this.self ? profile?.heartsteelBonusHealth ?? 0 : member?.heartsteelBonusHealth ?? 0;
  const result = calculateHeartsteelHitFromBonus(bonusBefore);
  const bonusHealth = normalizeHeartsteelBonusHealth(bonusBefore + result.bonusGain);
  this.sendShared({ t: 'heartsteelHit', id, winner, damage: result.damage, bonusGain: result.bonusGain, bonusHealth }, { respectPause: false, useRelayCap: false });
  this.applyHeartsteelHit({ id, winner, damage: result.damage, bonusGain: result.bonusGain, bonusHealth, ts: this.deps.now() });
}
```

- Implement final hit application:
  - ignore unknown, expired, duplicate, or target-mismatched hits
  - update remote member bonus when winner is remote
  - emit `'heartsteelBonusHealth'` when winner is self
  - emit `'heartsteelHit'`
  - clear target and emit `'heartsteelClear'`
  - update room state

Modify `src/main/index.ts`:

```ts
room.on('heartsteelBonusHealth', (heartsteelBonusHealth: number) => {
  store.update({ heartsteelBonusHealth });
});
```

When the store changes and `heartsteelBonusHealth` changes, call `room.profileChanged()` and `pushRoom()`.

- [ ] **Step 4: Run green tests**

Run:

```powershell
npm run test -- tests/main/roomManager.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/main/roomManager.ts src/main/index.ts tests/main/roomManager.test.ts
git commit -m "Resolve Heartsteel room claims"
```

---

### Task 5: Settings IPC And Room Toggle Wiring

**Files:**
- Modify: `src/shared/settingsChannels.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/settings.ts`
- Modify: `src/main/settingsIpc.ts`
- Modify: `src/main/index.ts`
- Test: `tests/main/settingsIpc.test.ts`

**Interfaces:**
- Produces settings API:
  - `SettingsApi.setHeartsteelEnabled(on: boolean): Promise<void>`
- Produces IPC channel:
  - `SETTINGS_CH.roomHeartsteelSet = 'room:heartsteelSet'`
- Extends `registerSettingsIpc` room deps with:
  - `setHeartsteelEnabled(on: boolean): void`

- [ ] **Step 1: Write failing IPC test**

In `tests/main/settingsIpc.test.ts`, extend the fake room dependency with:

```ts
setHeartsteelEnabled: vi.fn(),
```

Add a test:

```ts
it('toggles the room Heartsteel game only for boolean input', async () => {
  await call(SETTINGS_CH.roomHeartsteelSet, true);
  expect(room.setHeartsteelEnabled).toHaveBeenCalledWith(true);
  await call(SETTINGS_CH.roomHeartsteelSet, false);
  expect(room.setHeartsteelEnabled).toHaveBeenCalledWith(false);
  await call(SETTINGS_CH.roomHeartsteelSet, 'yes');
  expect(room.setHeartsteelEnabled).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run red test**

Run:

```powershell
npm run test -- tests/main/settingsIpc.test.ts
```

Expected: fails because `roomHeartsteelSet` and dependency method are missing.

- [ ] **Step 3: Implement IPC channel and API method**

Modify `src/shared/settingsChannels.ts`:

```ts
roomHeartsteelSet: 'room:heartsteelSet',
```

Modify `src/shared/ipc.ts` `SettingsApi`:

```ts
setHeartsteelEnabled(on: boolean): Promise<void>;
```

Modify `src/preload/settings.ts`:

```ts
setHeartsteelEnabled: (on) => ipcRenderer.invoke(SETTINGS_CH.roomHeartsteelSet, on),
```

Modify `src/main/settingsIpc.ts` room dependency type:

```ts
setHeartsteelEnabled(on: boolean): void;
```

Register handler:

```ts
ipcMain.handle(SETTINGS_CH.roomHeartsteelSet, (_e, on: unknown) => {
  if (typeof on === 'boolean') d.room.setHeartsteelEnabled(on);
});
```

Modify `src/main/index.ts` `registerSettingsIpc` room object:

```ts
setHeartsteelEnabled: (on) => room.setHeartsteelEnabled(on),
```

- [ ] **Step 4: Run green test**

Run:

```powershell
npm run test -- tests/main/settingsIpc.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/settingsChannels.ts src/shared/ipc.ts src/preload/settings.ts src/main/settingsIpc.ts src/main/index.ts tests/main/settingsIpc.test.ts
git commit -m "Wire Heartsteel room toggle IPC"
```

---

### Task 6: Overlay Target Rendering, Hit Shape, Sound, And Hit Feedback

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/overlay.ts`
- Modify: `src/main/overlayManager.ts`
- Modify: `src/main/index.ts`
- Create: `src/renderer/overlay/heartsteelStage.ts`
- Modify: `src/renderer/overlay/main.ts`
- Modify: `src/renderer/overlay/overlay.css`
- Test: `tests/main/overlayManager.test.ts`
- Test: `tests/renderer/heartsteelStage.test.ts`

**Interfaces:**
- Consumes: `HeartsteelTarget`, `HeartsteelHit`, `HeartsteelCursorKind`, `HEARTSTEEL_TARGET_HIT_RADIUS_PX`.
- Produces overlay events:
  - `'heartsteel:target': { id: string; x: number; y: number; expiresAt: number; cursor: HeartsteelCursorKind }`
  - `'heartsteel:clear': { id?: string } | null`
  - `'heartsteel:hit': { id: string; x: number; y: number; winnerName: string; winnerColor: number; damage: number; bonusGain: number }`
- Produces overlay report:
  - `OVERLAY_HEARTSTEEL_CLAIM = 'overlay:heartsteelClaim'`
  - `overlay.reportHeartsteelClaim(id: string, x: number, y: number): void`
- Produces `OverlayManager` methods:
  - `showHeartsteelTarget(payload: { displayId: number; id: string; x: number; y: number; expiresAt: number; cursor: HeartsteelCursorKind }): void`
  - `clearHeartsteelTarget(id?: string): void`
  - `showHeartsteelHit(payload: { displayId: number; id: string; x: number; y: number; winnerName: string; winnerColor: number; damage: number; bonusGain: number }): void`

- [ ] **Step 1: Write failing OverlayManager shape and claim tests**

Update the fake `BrowserWindow` in `tests/main/overlayManager.test.ts`:

```ts
setShape = vi.fn();
setIgnoreMouseEvents = vi.fn();
```

Import `OVERLAY_HEARTSTEEL_CLAIM`.

Add tests:

```ts
describe('OverlayManager Heartsteel targets', () => {
  it('shows a target, opens only a small hit shape, and clears it back to click-through', () => {
    mgr.showHeartsteelTarget({ displayId: 1, id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5, cursor: 'modern' });
    expect(sent(0)).toEqual([['heartsteel:target', { id: '1'.repeat(32), x: 100, y: 200, expiresAt: 5, cursor: 'modern' }]]);
    expect(h.windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(h.windows[0].setShape).toHaveBeenLastCalledWith([{ x: 52, y: 152, width: 96, height: 96 }]);

    mgr.clearHeartsteelTarget('1'.repeat(32));
    expect(sent(0).at(-1)).toEqual(['heartsteel:clear', { id: '1'.repeat(32) }]);
    expect(h.windows[0].setShape).toHaveBeenLastCalledWith([]);
    expect(h.windows[0].setIgnoreMouseEvents).toHaveBeenLastCalledWith(true);
  });

  it('emits a Heartsteel claim report from the target display', () => {
    const claim = vi.fn();
    mgr.on('heartsteelClaim', claim);
    h.handlers.get(OVERLAY_HEARTSTEEL_CLAIM)!({ sender: h.windows[1].webContents }, { id: '2'.repeat(32), x: 10, y: 20 });
    expect(claim).toHaveBeenCalledWith({ id: '2'.repeat(32), displayId: 2, x: 10, y: 20 });
  });
});
```

- [ ] **Step 2: Write failing renderer stage tests**

Create `tests/renderer/heartsteelStage.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartsteelStage } from '../../src/renderer/overlay/heartsteelStage';

describe('HeartsteelStage', () => {
  let root: HTMLElement;
  let reports: Array<{ id: string; x: number; y: number }>;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = document.getElementById('root')!;
    reports = [];
  });

  it('reports right-click hits and ignores left clicks', () => {
    const stage = new HeartsteelStage(root, (id, x, y) => reports.push({ id, x, y }), { play: vi.fn() });
    stage.showTarget({ id: 'a'.repeat(32), x: 30, y: 40, expiresAt: Date.now() + 1000, cursor: 'modern' });
    const target = root.querySelector('.heartsteelTarget') as HTMLElement;
    target.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 30, clientY: 40, bubbles: true }));
    target.dispatchEvent(new MouseEvent('contextmenu', { button: 2, clientX: 30, clientY: 40, bubbles: true }));
    target.dispatchEvent(new MouseEvent('mousedown', { button: 2, clientX: 31, clientY: 41, bubbles: true }));
    expect(reports).toEqual([{ id: 'a'.repeat(32), x: 31, y: 41 }]);
  });

  it('shows hit feedback and plays the Heartsteel sound', () => {
    const sound = { play: vi.fn() };
    const stage = new HeartsteelStage(root, vi.fn(), sound);
    stage.showHit({ id: 'b'.repeat(32), x: 80, y: 90, winnerName: 'Alex', winnerColor: 2, damage: 185, bonusGain: 19 });
    expect(root.textContent).toContain('185');
    expect(root.textContent).toContain('+19');
    expect(root.textContent).toContain('Alex');
    expect(sound.play).toHaveBeenCalledWith('heartsteel', expect.any(Number));
  });
});
```

- [ ] **Step 3: Run red tests**

Run:

```powershell
npm run test -- tests/main/overlayManager.test.ts tests/renderer/heartsteelStage.test.ts
```

Expected: missing channels, methods, and stage file failures.

- [ ] **Step 4: Implement overlay channels and manager shape control**

Modify `src/shared/ipc.ts`:

```ts
import type { HeartsteelCursorKind } from './heartsteel';
```

Add event types and channel constant:

```ts
'heartsteel:target': { id: string; x: number; y: number; expiresAt: number; cursor: HeartsteelCursorKind };
'heartsteel:clear': { id?: string } | null;
'heartsteel:hit': { id: string; x: number; y: number; winnerName: string; winnerColor: number; damage: number; bonusGain: number };
export const OVERLAY_HEARTSTEEL_CLAIM = 'overlay:heartsteelClaim';
```

Include the new renderer channels in `OVERLAY_CHANNELS`.

Modify `src/preload/overlay.ts`:

```ts
reportHeartsteelClaim(id: string, x: number, y: number): void {
  ipcRenderer.send(OVERLAY_HEARTSTEEL_CLAIM, { id, x, y });
},
```

Modify `src/main/overlayManager.ts`:

- Listen for `OVERLAY_HEARTSTEEL_CLAIM`, validate id/x/y, and emit `'heartsteelClaim'`.
- Add `showHeartsteelTarget`, `clearHeartsteelTarget`, and `showHeartsteelHit`.
- Use `setShape([{ x, y, width, height }])` and `setIgnoreMouseEvents(false)` on the active target display.
- On clear, call `setShape([])` and `setIgnoreMouseEvents(true)` for all overlay windows.

- [ ] **Step 5: Implement renderer Heartsteel stage**

Create `src/renderer/overlay/heartsteelStage.ts` with:

```ts
import { TAG_COLORS } from '../../shared/roomColors';
import type { HeartsteelCursorKind } from '../../shared/heartsteel';

export interface HeartsteelSound {
  play(key: string, volume01: number): void;
}

export interface HeartsteelTargetView {
  id: string;
  x: number;
  y: number;
  expiresAt: number;
  cursor: HeartsteelCursorKind;
}

export interface HeartsteelHitView {
  id: string;
  x: number;
  y: number;
  winnerName: string;
  winnerColor: number;
  damage: number;
  bonusGain: number;
}

export class HeartsteelStage {
  private target: HTMLElement | null = null;
  private targetId: string | null = null;
  private expireTimer: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly report: (id: string, x: number, y: number) => void,
    private readonly sound: HeartsteelSound,
    private readonly volume: () => number = () => 1,
  ) {}

  showTarget(target: HeartsteelTargetView): void {
    this.clear();
    this.targetId = target.id;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `heartsteelTarget ${target.cursor}`;
    el.style.left = `${Math.round(target.x)}px`;
    el.style.top = `${Math.round(target.y)}px`;
    el.setAttribute('aria-label', 'Heartsteel target');
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 2 || this.targetId !== target.id) return;
      e.preventDefault();
      this.report(target.id, e.clientX, e.clientY);
    });
    el.innerHTML = '<span class="heartsteelAura"></span><span class="heartsteelCore"></span>';
    this.root.append(el);
    this.target = el;
    this.expireTimer = window.setTimeout(() => this.clear(target.id), Math.max(0, target.expiresAt - Date.now()));
  }

  clear(id?: string): void {
    if (id && this.targetId && id !== this.targetId) return;
    if (this.expireTimer !== null) window.clearTimeout(this.expireTimer);
    this.expireTimer = null;
    this.target?.remove();
    this.target = null;
    this.targetId = null;
  }

  showHit(hit: HeartsteelHitView): void {
    this.clear(hit.id);
    this.sound.play('heartsteel', this.volume());
    const el = document.createElement('div');
    el.className = 'heartsteelHit';
    el.style.left = `${Math.round(hit.x)}px`;
    el.style.top = `${Math.round(hit.y)}px`;
    el.style.setProperty('--tag-color', TAG_COLORS[hit.winnerColor] ?? TAG_COLORS[0]);
    el.innerHTML = `<b>${hit.damage}</b><span>+${hit.bonusGain}</span><small></small>`;
    el.querySelector('small')!.textContent = hit.winnerName;
    this.root.append(el);
    window.setTimeout(() => el.remove(), 1600);
  }
}
```

Modify `src/renderer/overlay/main.ts`:

- Create `heartsteelLayer` after `chatLayer`.
- Instantiate `new HeartsteelStage(heartsteelLayer, (id, x, y) => window.overlay.reportHeartsteelClaim(id, x, y), sounds, volume)`.
- Wire `'heartsteel:target'`, `'heartsteel:clear'`, and `'heartsteel:hit'`.
- Add `{ key: 'heartsteel', url: '../sounds/heartsteel.mp3' }` to `soundEntries`.

Add CSS to `overlay.css` for `.heartsteelTarget`, `.heartsteelAura`, `.heartsteelCore`, `.heartsteelHit`, and cursor URL classes.

- [ ] **Step 6: Wire RoomManager events to overlay**

Modify `src/main/index.ts`:

- On `room.on('heartsteelTarget')`, map display number to local display coordinates using `resolveTarget(overlays.numbered(), target.d)` and call `overlays.showHeartsteelTarget`.
- Determine cursor:

```ts
const heartsteelCursor = (): HeartsteelCursorKind =>
  settings.cursorSkinEnabled ? (settings.cursorSkinClassic ? 'classic' : 'modern') : 'system';
```

- On `room.on('heartsteelClear')`, call `overlays.clearHeartsteelTarget`.
- On `room.on('heartsteelHit')`, map the target to local display coordinates and call `overlays.showHeartsteelHit`.
- On `overlays.on('heartsteelClaim')`, call `room.claimHeartsteelTarget(id)`.

- [ ] **Step 7: Run green tests**

Run:

```powershell
npm run test -- tests/main/overlayManager.test.ts tests/renderer/heartsteelStage.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add src/shared/ipc.ts src/preload/overlay.ts src/main/overlayManager.ts src/main/index.ts src/renderer/overlay/heartsteelStage.ts src/renderer/overlay/main.ts src/renderer/overlay/overlay.css tests/main/overlayManager.test.ts tests/renderer/heartsteelStage.test.ts
git commit -m "Render Heartsteel desktop targets"
```

---

### Task 7: Room UI Health Bars, Item Stacks, And Toggle

**Files:**
- Create: `src/renderer/settings/heartsteelView.ts`
- Modify: `src/renderer/settings/components/RoomSection.tsx`
- Modify: `src/renderer/settings/settings.css`
- Modify: `src/shared/i18n.ts`
- Test: `tests/renderer/heartsteelView.test.ts`
- Test: `tests/shared/i18n.test.ts`

**Interfaces:**
- Produces:
  - `heartsteelHealthText(maxHealth: number): string`
  - `heartsteelStackText(bonusHealth: number): string`
  - `heartsteelFillPercent(maxHealth: number): number`
- Consumes:
  - `SettingsApi.setHeartsteelEnabled(on: boolean)`
  - `RoomState.heartsteel.enabled`
  - `RoomMember.heartsteelBonusHealth`
  - `RoomMember.heartsteelMaxHealth`

- [ ] **Step 1: Write failing view helper tests**

Create `tests/renderer/heartsteelView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { heartsteelFillPercent, heartsteelHealthText, heartsteelStackText } from '../../src/renderer/settings/heartsteelView';

describe('heartsteel room view helpers', () => {
  it('formats max health and stack text', () => {
    expect(heartsteelHealthText(1000)).toBe('1000');
    expect(heartsteelHealthText(12345)).toBe('12345');
    expect(heartsteelStackText(0)).toBe('0');
    expect(heartsteelStackText(9876)).toBe('9876');
  });

  it('keeps the health fill visible while capping huge growth', () => {
    expect(heartsteelFillPercent(1000)).toBe(52);
    expect(heartsteelFillPercent(2000)).toBeGreaterThan(52);
    expect(heartsteelFillPercent(50000)).toBe(100);
  });
});
```

- [ ] **Step 2: Write failing i18n tests**

Append to `tests/shared/i18n.test.ts`:

```ts
it('labels the Heartsteel room game in both languages', () => {
  const en = strings('en');
  const zh = strings('zh-CN');
  expect(en.heartsteelTitle).toBe('Heartsteel');
  expect(en.heartsteelToggle).toContain('Start');
  expect(zh.heartsteelTitle).toBe('心之钢');
  expect(zh.heartsteelToggle).toContain('开钢');
});
```

- [ ] **Step 3: Run red tests**

Run:

```powershell
npm run test -- tests/renderer/heartsteelView.test.ts tests/shared/i18n.test.ts
```

Expected: missing helper and missing strings failures.

- [ ] **Step 4: Implement view helpers**

Create `src/renderer/settings/heartsteelView.ts`:

```ts
import { HEARTSTEEL_BASE_HEALTH, heartsteelStacks, normalizeHeartsteelBonusHealth } from '../../shared/heartsteel';

export function heartsteelHealthText(maxHealth: number): string {
  return String(Math.max(HEARTSTEEL_BASE_HEALTH, Math.round(maxHealth)));
}

export function heartsteelStackText(bonusHealth: number): string {
  return String(heartsteelStacks(bonusHealth));
}

export function heartsteelFillPercent(maxHealth: number): number {
  const safe = Math.max(HEARTSTEEL_BASE_HEALTH, Math.round(maxHealth));
  const bonus = normalizeHeartsteelBonusHealth(safe - HEARTSTEEL_BASE_HEALTH);
  return Math.min(100, 52 + Math.round(Math.log10(1 + bonus) * 16));
}
```

- [ ] **Step 5: Add i18n strings**

Add to English strings:

```ts
heartsteelTitle: 'Heartsteel',
heartsteelToggle: 'Start Heartsteel',
heartsteelToggleOff: 'Stop Heartsteel',
heartsteelDesc: 'Race to right-click desktop Heartsteel targets. Hits permanently add max health to the clicker.',
heartsteelNeedRoom: 'Join a room to start Heartsteel.',
heartsteelHealth: 'Max health',
heartsteelStacks: 'Stacks',
```

Add to Chinese strings:

```ts
heartsteelTitle: '心之钢',
heartsteelToggle: '开钢',
heartsteelToggleOff: '停钢',
heartsteelDesc: '抢右键点击桌面上的心之钢红点，命中者永久增加最大生命值。',
heartsteelNeedRoom: '加入房间后才能开钢。',
heartsteelHealth: '最大生命值',
heartsteelStacks: '层数',
```

- [ ] **Step 6: Implement RoomSection UI**

Modify `src/renderer/settings/components/RoomSection.tsx`:

- Import `Heart24Regular` or `Games24Regular` from Fluent icons; use `DataPie24Regular` if no better icon is available in the installed package.
- Import `heartsteelFillPercent`, `heartsteelHealthText`, `heartsteelStackText`.
- Add a Heartsteel switch row near the in-room card:

```tsx
<SwitchRow
  icon={<Heart24Regular />}
  title={t.heartsteelTitle}
  description={room.phase === 'active' ? t.heartsteelDesc : t.heartsteelNeedRoom}
  checked={room.heartsteel.enabled}
  onChange={(v) => void api.setHeartsteelEnabled(v)}
  dim={room.phase !== 'active'}
/>
```

- In `MemberRow`, render:

```tsx
<div className="heartsteelMember">
  <div className="heartsteelBar" aria-label={`${t.heartsteelHealth} ${heartsteelHealthText(m.heartsteelMaxHealth)}`}>
    <span className="heartsteelBarFill" style={{ width: `${heartsteelFillPercent(m.heartsteelMaxHealth)}%` }} />
    <span className="heartsteelBarTicks" />
    <span className="heartsteelBarText">{heartsteelHealthText(m.heartsteelMaxHealth)}</span>
  </div>
  <span className="heartsteelItem" title={`${t.heartsteelStacks}: ${heartsteelStackText(m.heartsteelBonusHealth)}`}>
    <img src="../heartsteel/item.png" alt="" />
    <span>{heartsteelStackText(m.heartsteelBonusHealth)}</span>
  </span>
</div>
```

Add CSS in `src/renderer/settings/settings.css` for a compact metal-frame red bar and item stack badge.

- [ ] **Step 7: Run green tests**

Run:

```powershell
npm run test -- tests/renderer/heartsteelView.test.ts tests/shared/i18n.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```powershell
git add src/renderer/settings/heartsteelView.ts src/renderer/settings/components/RoomSection.tsx src/renderer/settings/settings.css src/shared/i18n.ts tests/renderer/heartsteelView.test.ts tests/shared/i18n.test.ts
git commit -m "Show Heartsteel room health"
```

---

### Task 8: Assets, Asset Checks, And Packaged Paths

**Files:**
- Add: `assets/heartsteel/target-reference.png`
- Add: `assets/heartsteel/item.png`
- Add: `assets/sounds/heartsteel.mp3`
- Modify: `src/renderer/overlay/main.ts`
- Test: `tests/shared/heartsteelAssets.test.ts`

**Interfaces:**
- Produces package-stable asset paths:
  - `../heartsteel/item.png`
  - `../heartsteel/target-reference.png`
  - `../sounds/heartsteel.mp3`

- [ ] **Step 1: Write failing asset existence test**

Create `tests/shared/heartsteelAssets.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const assets = resolve(__dirname, '../../assets');

describe('heartsteel assets', () => {
  it('ships the Heartsteel item, target reference, and sound under ASCII file names', () => {
    expect(existsSync(resolve(assets, 'heartsteel', 'item.png'))).toBe(true);
    expect(existsSync(resolve(assets, 'heartsteel', 'target-reference.png'))).toBe(true);
    expect(existsSync(resolve(assets, 'sounds', 'heartsteel.mp3'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run red test**

Run:

```powershell
npm run test -- tests/shared/heartsteelAssets.test.ts
```

Expected: fails because the ASCII asset copies do not exist yet.

- [ ] **Step 3: Copy user-provided assets into develop worktree**

Run:

```powershell
New-Item -ItemType Directory -Force -Path '.\assets\heartsteel'
Copy-Item -LiteralPath 'D:\cc_workspace\lolping\assets\心之钢装备图.png' -Destination '.\assets\heartsteel\item.png'
Copy-Item -LiteralPath 'D:\cc_workspace\lolping\assets\心之钢效果参考图.png' -Destination '.\assets\heartsteel\target-reference.png'
Copy-Item -LiteralPath 'D:\cc_workspace\lolping\assets\sounds\心之钢音效.mp3' -Destination '.\assets\sounds\heartsteel.mp3'
```

- [ ] **Step 4: Include Heartsteel assets in overlay missing-asset reporting**

Modify `src/renderer/overlay/main.ts` `checkImages()` so it probes:

```ts
const heartsteelImages = [
  probe('../heartsteel/item.png', 'heartsteel/item.png'),
  probe('../heartsteel/target-reference.png', 'heartsteel/target-reference.png'),
];
return Promise.all([...pings, ...emotes, ...actions, ...heartsteelImages]).then((r) => r.filter((x): x is string => x !== null));
```

The sound entry from Task 6 already makes `sounds/heartsteel.mp3` appear in the existing missing sound reporting.

- [ ] **Step 5: Run green test**

Run:

```powershell
npm run test -- tests/shared/heartsteelAssets.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add assets/heartsteel/item.png assets/heartsteel/target-reference.png assets/sounds/heartsteel.mp3 src/renderer/overlay/main.ts tests/shared/heartsteelAssets.test.ts
git commit -m "Add Heartsteel assets"
```

---

### Task 9: Full Verification, Packaging, And Manual Smoke Test

**Files:**
- Modify only if a verification failure reveals a defect in files from earlier tasks.

**Interfaces:**
- Consumes all previous tasks.
- Produces refreshed packaged artifacts:
  - `release/lolPing-moyudazi-Setup-0.5.0.exe`
  - `release/win-unpacked/lolPing-摸鱼搭子.exe`

- [ ] **Step 1: Run focused feature tests**

Run:

```powershell
npm run test -- tests/shared/heartsteel.test.ts tests/shared/heartsteelAssets.test.ts tests/shared/roomProtocol.test.ts tests/main/roomManager.test.ts tests/main/settingsIpc.test.ts tests/main/overlayManager.test.ts tests/renderer/heartsteelStage.test.ts tests/renderer/heartsteelView.test.ts tests/shared/i18n.test.ts
```

Expected: all listed files pass.

- [ ] **Step 2: Run full automated verification**

Run:

```powershell
npm run test
npm run typecheck
git diff --check
```

Expected:

- Vitest reports all test files passing.
- TypeScript reports no errors.
- `git diff --check` prints no whitespace errors.

- [ ] **Step 3: Run helper build if native helper files changed**

The first implementation should not require native helper changes. If a previous task changed `native/hook-helper`, run:

```powershell
npm run build:helper
npm run test:helper
```

Expected: helper builds and helper tests pass.

- [ ] **Step 4: Package the app**

Run:

```powershell
npm run dist
```

Expected: electron-builder completes and regenerates:

- `release\lolPing-moyudazi-Setup-0.5.0.exe`
- `release\lolPing-moyudazi-Setup-0.5.0.exe.blockmap`
- `release\win-unpacked\lolPing-摸鱼搭子.exe`
- `release\latest.yml`

If packaging fails because `release\win-unpacked\lolPing-摸鱼搭子.exe` is running, close only processes whose executable path starts with `D:\cc_workspace\lolping\.worktrees\develop\release\win-unpacked`, then rerun `npm run dist`.

- [ ] **Step 5: Manual smoke test in dev mode**

Run with isolated user data:

```powershell
$env:ELECTRON_CLI_ARGS='["--user-data-dir=C:\\Users\\DELL\\AppData\\Roaming\\lolPing-dev"]'
npm run dev
```

Check:

- Room page shows the Heartsteel switch only usable in an active room.
- Turning Heartsteel on shows the room state as enabled.
- A target appears on the desktop about every 3 seconds.
- Right-clicking the target plays the Heartsteel sound and shows damage, bonus gain, and winner name.
- Normal desktop clicks outside the target are not blocked while the target is visible.
- The local member's item stack increases and remains after leaving and rejoining a room.
- The packaged `win-unpacked` app can start and show the same Heartsteel UI.

- [ ] **Step 6: Commit final verification fixes if any**

If Step 1 through Step 5 required fixes, commit them:

```powershell
git add <changed-files>
git commit -m "Polish Heartsteel room game"
```

If there were no fixes after the prior task commits, leave this step checked without creating an empty commit.

