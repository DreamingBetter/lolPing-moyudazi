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
});
