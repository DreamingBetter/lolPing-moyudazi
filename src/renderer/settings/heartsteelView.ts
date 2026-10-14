import type { CSSProperties } from 'react';
import { HEARTSTEEL_BASE_HEALTH, heartsteelStacks, normalizeHeartsteelBonusHealth } from '../../shared/heartsteel';

export type HeartsteelTickStyle = CSSProperties & {
  '--heartsteel-small-tick': string;
  '--heartsteel-large-tick': string;
};

export function heartsteelHealthText(maxHealth: number): string {
  return String(Math.max(HEARTSTEEL_BASE_HEALTH, Math.round(maxHealth)));
}

export function heartsteelStackText(bonusHealth: number): string {
  return String(heartsteelStacks(bonusHealth));
}

export function heartsteelFillPercent(maxHealth: number): number {
  return 100;
}

function percent(amount: number, maxHealth: number): string {
  const safe = Math.max(HEARTSTEEL_BASE_HEALTH, Math.round(maxHealth));
  return `${Number(((amount / safe) * 100).toFixed(3))}%`;
}

export function heartsteelTickStyle(maxHealth: number): HeartsteelTickStyle {
  const safe = HEARTSTEEL_BASE_HEALTH + normalizeHeartsteelBonusHealth(maxHealth - HEARTSTEEL_BASE_HEALTH);
  return {
    '--heartsteel-small-tick': percent(100, safe),
    '--heartsteel-large-tick': percent(1000, safe),
  };
}
