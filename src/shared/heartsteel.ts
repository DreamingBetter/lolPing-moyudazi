export const HEARTSTEEL_BASE_HEALTH = 2000;
export const HEARTSTEEL_BONUS_MAX = 999_999;
export const HEARTSTEEL_TARGET_TTL_MS = 4200;
export const HEARTSTEEL_TARGET_HIT_RADIUS_PX = 48;
export const HEARTSTEEL_HIT_FEEDBACK_MS = 1800;
export const HEARTSTEEL_TARGET_CAP_DEFAULT = 3;
export const HEARTSTEEL_TARGET_LIFETIME_S_DEFAULT = 4.2;
export const HEARTSTEEL_TARGET_TICK_MS = 250;
export const HEARTSTEEL_TARGET_PACES = ['steelOnce', 'normalSteel', 'funSteel'] as const;
export type HeartsteelTargetPace = typeof HEARTSTEEL_TARGET_PACES[number];
export const HEARTSTEEL_TARGET_PACE_RANGES_MS: Record<HeartsteelTargetPace, {
  min: number;
  max: number;
  targetCap: number;
  targetLifetimeMs: number;
}> = {
  steelOnce: { min: 1800, max: 2800, targetCap: 1, targetLifetimeMs: 3400 },
  normalSteel: { min: 900, max: 1600, targetCap: 3, targetLifetimeMs: 4200 },
  funSteel: { min: 450, max: 900, targetCap: 5, targetLifetimeMs: 4800 },
};

export interface HeartsteelRuntimeConfig {
  targetCap: number;
  targetLifetimeMs: number;
  targetPace: HeartsteelTargetPace;
}

export const DEFAULT_HEARTSTEEL_RUNTIME_CONFIG: HeartsteelRuntimeConfig = {
  targetCap: HEARTSTEEL_TARGET_CAP_DEFAULT,
  targetLifetimeMs: HEARTSTEEL_TARGET_TTL_MS,
  targetPace: 'normalSteel',
};

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
  target: HeartsteelTarget;
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

export function heartsteelSpawnDelayMs(pace: HeartsteelTargetPace, randomByte: number): number {
  const range = HEARTSTEEL_TARGET_PACE_RANGES_MS[pace] ?? HEARTSTEEL_TARGET_PACE_RANGES_MS.normalSteel;
  const t = Math.min(255, Math.max(0, Math.round(randomByte)));
  return range.min + Math.round((t / 255) * (range.max - range.min));
}

export function heartsteelRuntimeConfigForPace(pace: HeartsteelTargetPace): HeartsteelRuntimeConfig {
  const preset = HEARTSTEEL_TARGET_PACE_RANGES_MS[pace] ?? HEARTSTEEL_TARGET_PACE_RANGES_MS.normalSteel;
  return { targetCap: preset.targetCap, targetLifetimeMs: preset.targetLifetimeMs, targetPace: pace };
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
