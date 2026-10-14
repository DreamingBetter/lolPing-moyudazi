export const HEARTSTEEL_BASE_HEALTH = 2000;
export const HEARTSTEEL_BONUS_MAX = 999_999;
export const HEARTSTEEL_TARGET_INTERVAL_MS = 3000;
export const HEARTSTEEL_TARGET_TTL_MS = 2400;
export const HEARTSTEEL_TARGET_HIT_RADIUS_PX = 48;

export interface HeartsteelHitResult {
  damage: number;
  bonusGain: number;
}

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
