import { describe, expect, it } from 'vitest';
import {
  HEARTSTEEL_BASE_HEALTH,
  HEARTSTEEL_TARGET_PACE_RANGES_MS,
  DEFAULT_HEARTSTEEL_RUNTIME_CONFIG,
  calculateHeartsteelHit,
  calculateHeartsteelHitFromBonus,
  heartsteelMaxHealth,
  heartsteelRuntimeConfigForPace,
  heartsteelSchedulerPeer,
  heartsteelSpawnDelayMs,
  heartsteelStacks,
  isHeartsteelTargetId,
  normalizeHeartsteelBonusHealth,
} from '../../src/shared/heartsteel';

describe('heartsteel math', () => {
  it('starts at 2000 max health and uses integer Heartsteel hit math', () => {
    expect(HEARTSTEEL_BASE_HEALTH).toBe(2000);
    expect(heartsteelMaxHealth(0)).toBe(2000);
    expect(heartsteelStacks(19)).toBe(19);
    expect(calculateHeartsteelHit(2000)).toEqual({ damage: 245, bonusGain: 25 });
    expect(calculateHeartsteelHitFromBonus(19)).toEqual({ damage: 246, bonusGain: 25 });
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

  it('maps Heartsteel entertainment pace labels to randomized spawn delays', () => {
    expect(HEARTSTEEL_TARGET_PACE_RANGES_MS).toEqual({
      steelOnce: { min: 1800, max: 2800, targetCap: 1, targetLifetimeMs: 3400 },
      normalSteel: { min: 900, max: 1600, targetCap: 3, targetLifetimeMs: 4200 },
      funSteel: { min: 450, max: 900, targetCap: 5, targetLifetimeMs: 4800 },
    });
    expect(DEFAULT_HEARTSTEEL_RUNTIME_CONFIG).toEqual({ targetCap: 3, targetLifetimeMs: 4200, targetPace: 'normalSteel' });
    expect(heartsteelRuntimeConfigForPace('steelOnce')).toEqual({ targetCap: 1, targetLifetimeMs: 3400, targetPace: 'steelOnce' });
    expect(heartsteelRuntimeConfigForPace('funSteel')).toEqual({ targetCap: 5, targetLifetimeMs: 4800, targetPace: 'funSteel' });
    expect(heartsteelSpawnDelayMs('normalSteel', 0)).toBe(900);
    expect(heartsteelSpawnDelayMs('normalSteel', 255)).toBe(1600);
    expect(heartsteelSpawnDelayMs('funSteel', 128)).toBe(676);
  });
});
