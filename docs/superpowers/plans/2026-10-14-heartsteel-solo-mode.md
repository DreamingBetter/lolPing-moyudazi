# Heartsteel Solo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Heartsteel run as a visible single-player desktop mini-game outside rooms while keeping multiplayer room behavior.

**Architecture:** Extend the existing `RoomManager` Heartsteel state machine so it can run while idle for the local user, but still uses scheduler messages when in an active room. The settings renderer should always render a Heartsteel status card using the self member from `RoomState`, and the health view should switch from progress fill to full current-health display with tick density derived from max health.

**Tech Stack:** Electron main process, TypeScript shared state, React settings renderer, CSS health bar styling, Vitest.

## Global Constraints

- Work in `.worktrees/develop` on `develop`.
- Use TDD for behavior changes.
- Base Heartsteel max health is `2000`.
- Current health is always full.
- Small health ticks represent `100` max health; heavy ticks represent `1000` max health.
- Run `npm run dist` after implementation so the user can test the packaged result.

---

### Task 1: Heartsteel Math And Room State

**Files:**
- Modify: `src/shared/heartsteel.ts`
- Modify: `src/main/roomManager.ts`
- Test: `tests/shared/heartsteel.test.ts`
- Test: `tests/main/roomManager.test.ts`

**Interfaces:**
- Produces: `HEARTSTEEL_BASE_HEALTH = 2000`
- Produces: idle `RoomManager.state().members[0]` with self Heartsteel fields

- [ ] **Step 1: Write failing tests**

```ts
expect(heartsteelMaxHealth(0)).toBe(2000);
expect(calculateHeartsteelHit(2000)).toEqual({ damage: 245, bonusGain: 25 });
expect(room.state().members[0]).toMatchObject({ self: true, heartsteelMaxHealth: 2000 });
```

- [ ] **Step 2: Run focused tests and see them fail**

Run: `npm run test -- tests/shared/heartsteel.test.ts tests/main/roomManager.test.ts`

- [ ] **Step 3: Implement minimal production changes**

Set the base health constant to `2000` and make `RoomManager.state()` include the self member in idle state.

- [ ] **Step 4: Run focused tests and see them pass**

Run: `npm run test -- tests/shared/heartsteel.test.ts tests/main/roomManager.test.ts`

### Task 2: Local Heartsteel Mode

**Files:**
- Modify: `src/main/roomManager.ts`
- Test: `tests/main/roomManager.test.ts`

**Interfaces:**
- Consumes: existing `setHeartsteelEnabled(on: boolean)`
- Produces: idle Heartsteel target scheduling and local claim resolution

- [ ] **Step 1: Write failing test**

```ts
room.setHeartsteelEnabled(true);
await vi.advanceTimersByTimeAsync(3000);
expect(heartsteelTargets).toHaveLength(1);
room.claimHeartsteelTarget(heartsteelTargets[0].id);
expect(profile.heartsteelBonusHealth).toBeGreaterThan(0);
```

- [ ] **Step 2: Run focused test and see it fail**

Run: `npm run test -- tests/main/roomManager.test.ts`

- [ ] **Step 3: Implement minimal production changes**

Allow `setHeartsteelEnabled(true)` while idle, start a lightweight local ticker, publish local targets without room packets, and resolve local claims directly.

- [ ] **Step 4: Run focused test and see it pass**

Run: `npm run test -- tests/main/roomManager.test.ts`

### Task 3: Settings Heartsteel UI And Health Bar

**Files:**
- Modify: `src/renderer/settings/heartsteelView.ts`
- Modify: `src/renderer/settings/components/RoomSection.tsx`
- Modify: `src/renderer/settings/settings.css`
- Test: `tests/renderer/heartsteelView.test.ts`

**Interfaces:**
- Produces: `heartsteelFillPercent(maxHealth: number): 100`
- Produces: `heartsteelTickStyle(maxHealth: number)` with 100/1000 tick spacing

- [ ] **Step 1: Write failing tests**

```ts
expect(heartsteelFillPercent(2000)).toBe(100);
expect(heartsteelTickStyle(2000)).toMatchObject({ '--heartsteel-small-tick': '5%' });
```

- [ ] **Step 2: Run renderer helper test and see it fail**

Run: `npm run test -- tests/renderer/heartsteelView.test.ts`

- [ ] **Step 3: Implement minimal production changes**

Always render the Heartsteel row before room join controls, derive the row/member data from the self member, and switch CSS to a green full bar with tick variables.

- [ ] **Step 4: Run focused tests and see them pass**

Run: `npm run test -- tests/renderer/heartsteelView.test.ts`

### Task 4: Documentation, Verification, Packaging

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: implemented behavior from Tasks 1-3
- Produces: updated project convention notes and packaged Windows build

- [ ] **Step 1: Update project notes**

Record that Heartsteel is global, supports solo idle play, starts at `2000` max health, and uses full green LoL-style health bars.

- [ ] **Step 2: Run verification**

Run: `npm run test`
Run: `npm run typecheck`
Run: `git diff --check`

- [ ] **Step 3: Package**

Run: `npm run dist`

- [ ] **Step 4: Commit**

Commit the complete feature slice on `develop`.
