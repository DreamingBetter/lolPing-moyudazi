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
