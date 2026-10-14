import { ANNOUNCED_MAX, HASH_RE, isEmoteRefShape, type EmoteRef } from './emotes';
import {
  HEARTSTEEL_BASE_HEALTH,
  HEARTSTEEL_BONUS_MAX,
  calculateHeartsteelHit,
  isHeartsteelTargetId,
  normalizeHeartsteelBonusHealth,
} from './heartsteel';
import { isPingId, type PingId } from './pings';
import { isTagColor } from './roomColors';
import { CHAT_TEXT_MAX_CODE_POINTS, type ChatHistoryItem } from './roomChat';

/** Bumped when room messages change incompatibly. Peers on another version are shown as "needs update". */
export const PROTOCOL_VERSION = 1;
export const MAX_NAME = 16;
const MAX_DISPLAY = 16;
const MAX_APP_VERSION = 64;

export type MemberStatus = 'on' | 'paused' | 'muted';
const STATUSES: readonly MemberStatus[] = ['on', 'paused', 'muted'];

interface Base {
  /** Random per launch, 16 lower-case hex characters. */
  peer: string;
  /** +1 for every message the peer sends. */
  seq: number;
  /** Sender's clock, ms since epoch. */
  ts: number;
}
export interface PresenceMsg extends Base {
  t: 'presence';
  proto: number;
  app: string;
  name: string;
  color: number;
  status: MemberStatus;
  /** Hashes of the custom emotes on the sender's wheel and centre. */
  em?: string[];
  heartsteelBonusHealth?: number;
}
export interface PingMsg extends Base {
  t: 'ping';
  ping: PingId;
  /** Display number: 1 = primary. */
  d: number;
  /** Position as a fraction of that display, 0–1. */
  x: number;
  y: number;
}
/** Added in 0.5.0: older apps drop it as an unknown type. Position as in PingMsg. */
export interface EmoteMsg extends Base {
  t: 'emote';
  /** A bundled slug (possibly one only a newer app has) or 'c:' + hash of an imported emote. */
  e: EmoteRef;
  d: number;
  x: number;
  y: number;
}
export interface WantMsg extends Base {
  t: 'want';
  to: string;
  h: string;
  need: number[];
}
export interface ChunkMsg extends Base {
  t: 'chunk';
  h: string;
  i: number;
  n: number;
  b: string;
}
export interface ByeMsg extends Base {
  t: 'bye';
}
export interface ChatMsg extends Base {
  t: 'chat';
  id: string;
  text: string;
}
export interface ChatHistoryRequestMsg extends Base {
  t: 'chatHistoryRequest';
  request: string;
}
export interface ChatHistoryMsg extends Base {
  t: 'chatHistory';
  request: string;
  part: number;
  total: number;
  messages: ChatHistoryItem[];
}
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
export type RoomMessage =
  | PresenceMsg
  | PingMsg
  | EmoteMsg
  | WantMsg
  | ChunkMsg
  | ByeMsg
  | ChatMsg
  | ChatHistoryRequestMsg
  | ChatHistoryMsg
  | HeartsteelStateMsg
  | HeartsteelTargetMsg
  | HeartsteelClaimMsg
  | HeartsteelHitMsg;

// C0/C1 controls, zero-width characters, bidi marks, embeddings and isolates, BOM, line/paragraph separators,
// soft hyphen, combining grapheme joiner, Arabic letter mark, Mongolian vowel separator and the Hangul fillers
// (blank characters that would make a name invisible).
const UNSAFE_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\u3164\ufeff\uffa0]/g;
const UNSAFE_CHAT_CHARS =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\u3164\ufeff\uffa0]/g;

/** While typing: at most MAX_NAME code points (an emoji counts once; maxLength would count UTF-16 units). */
export const clampNameInput = (v: string): string => [...v].slice(0, MAX_NAME).join('');

/** A display name that can't hide, reorder or break the text around it. `max` is in code points. */
export function sanitizeName(raw: string, fallback = 'Player', max = MAX_NAME): string {
  const name = [...raw.replace(UNSAFE_CHARS, '').trim()].slice(0, max).join('').trim();
  return name || fallback;
}

export function sanitizeChatText(raw: string): string {
  return [...sanitizeChatTextRaw(raw)]
    .slice(0, CHAT_TEXT_MAX_CODE_POINTS)
    .join('');
}

function sanitizeChatTextRaw(raw: string): string {
  return raw.replace(UNSAFE_CHAT_CHARS, '').replace(/\r\n?/g, '\n').trim();
}

export function isChatTextTooLong(raw: string): boolean {
  return [...sanitizeChatTextRaw(raw)].length > CHAT_TEXT_MAX_CODE_POINTS;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUint = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isUnit = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;
export const isChatId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);

export const EMOTE_CHUNK_B64_MAX = 1000;
export const EMOTE_CHUNKS_MAX = 17;
export const EMOTE_NEED_MAX = 64;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function emList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string' || !HASH_RE.test(value) || out.includes(value)) continue;
    out.push(value);
    if (out.length >= ANNOUNCED_MAX) break;
  }
  return out;
}

function chatHistoryItem(raw: unknown): ChatHistoryItem | null {
  if (!isObj(raw)) return null;
  const { id, peer, ts, name, color, text } = raw;
  const clean = typeof text === 'string' ? sanitizeChatTextRaw(text) : '';
  if (!isChatId(id) || typeof peer !== 'string' || !/^[0-9a-f]{16}$/.test(peer) || !isUint(ts) || typeof name !== 'string') return null;
  if (!isTagColor(color) || !clean || [...clean].length > CHAT_TEXT_MAX_CODE_POINTS) return null;
  return { id, peer, ts, name: sanitizeName(name.slice(0, 256)), color, text: clean };
}

/** Builds a fresh message from known fields only, or null when anything is missing or out of range. */
export function validateMessage(raw: unknown): RoomMessage | null {
  if (!isObj(raw)) return null;
  const { t, peer, seq, ts } = raw;
  if (typeof peer !== 'string' || !/^[0-9a-f]{16}$/.test(peer) || !isUint(seq) || !isUint(ts)) return null;
  const base = { peer, seq, ts };
  switch (t) {
    case 'presence': {
      const { proto, app, name, color, status } = raw;
      if (!isUint(proto) || typeof app !== 'string' || app.length > MAX_APP_VERSION || typeof name !== 'string') return null;
      if (!isTagColor(color) || !STATUSES.includes(status as MemberStatus)) return null;
      const out: PresenceMsg = {
        t,
        ...base,
        proto,
        app,
        name: sanitizeName(name.slice(0, 256)),
        color,
        status: status as MemberStatus,
      };
      const bonus = normalizeHeartsteelBonusHealth(raw.heartsteelBonusHealth);
      const withEmotes = Array.isArray(raw.em) ? { ...out, em: emList(raw.em) } : out;
      return bonus > 0 ? { ...withEmotes, heartsteelBonusHealth: bonus } : withEmotes;
    }
    case 'ping': {
      const { ping, d, x, y } = raw;
      if (!isPingId(ping) || !Number.isInteger(d) || (d as number) < 1 || (d as number) > MAX_DISPLAY) return null;
      if (!isUnit(x) || !isUnit(y)) return null;
      return { t, ...base, ping, d: d as number, x, y };
    }
    case 'emote': {
      const { e, d, x, y } = raw;
      if (!isEmoteRefShape(e) || !Number.isInteger(d) || (d as number) < 1 || (d as number) > MAX_DISPLAY) return null;
      if (!isUnit(x) || !isUnit(y)) return null;
      return { t, ...base, e, d: d as number, x, y };
    }
    case 'want': {
      const { to, h, need } = raw;
      if (typeof to !== 'string' || !/^[0-9a-f]{16}$/.test(to) || typeof h !== 'string' || !HASH_RE.test(h)) return null;
      if (!Array.isArray(need) || need.length > EMOTE_NEED_MAX) return null;
      if (!need.every((value) => isUint(value) && (value as number) < EMOTE_CHUNKS_MAX)) return null;
      return { t, ...base, to, h, need: [...new Set(need)] };
    }
    case 'chunk': {
      const { h, i, n, b } = raw;
      if (typeof h !== 'string' || !HASH_RE.test(h)) return null;
      if (!isUint(n) || (n as number) < 1 || (n as number) > EMOTE_CHUNKS_MAX) return null;
      if (!isUint(i) || (i as number) >= (n as number)) return null;
      if (typeof b !== 'string' || b.length > EMOTE_CHUNK_B64_MAX || b.length % 4 !== 0 || !B64_RE.test(b)) return null;
      return { t, ...base, h, i: i as number, n: n as number, b };
    }
    case 'bye':
      return { t, ...base };
    case 'chat': {
      const { id, text } = raw;
      const clean = typeof text === 'string' ? sanitizeChatTextRaw(text) : '';
      if (!isChatId(id) || !clean || [...clean].length > CHAT_TEXT_MAX_CODE_POINTS) return null;
      return { t, ...base, id, text: clean };
    }
    case 'chatHistoryRequest': {
      const { request } = raw;
      if (!isChatId(request)) return null;
      return { t, ...base, request };
    }
    case 'chatHistory': {
      const { request, part, total, messages } = raw;
      if (!isChatId(request) || !isUint(part) || !isUint(total) || total < 1 || total > 256 || part >= total || !Array.isArray(messages) || messages.length > 50) {
        return null;
      }
      return {
        t,
        ...base,
        request,
        part,
        total,
        messages: messages.map(chatHistoryItem).filter((item): item is ChatHistoryItem => item !== null),
      };
    }
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
      const expected = calculateHeartsteelHit(HEARTSTEEL_BASE_HEALTH + previousBonus);
      if (expected.damage !== damage || expected.bonusGain !== bonusGain) return null;
      return { t, ...base, id, winner, damage, bonusGain, bonusHealth };
    }
    default:
      return null;
  }
}

const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

const PLAIN_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/** True only when `app` is a plain x.y.z version lower than `version`: anything else (a dev tool, a prerelease) isn't called old. */
export function isOlderThan(app: string, version: string): boolean {
  const a = PLAIN_VERSION.exec(app);
  const v = PLAIN_VERSION.exec(version);
  if (!a || !v) return false;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(a[i]) - Number(v[i]);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

export function encodeMessage(m: RoomMessage): Uint8Array {
  const out = m.t === 'ping' || m.t === 'emote' || m.t === 'heartsteelTarget' ? { ...m, x: round4(m.x), y: round4(m.y) } : m;
  return new TextEncoder().encode(JSON.stringify(out));
}

export function decodeMessage(bytes: Uint8Array): RoomMessage | null {
  try {
    return validateMessage(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    return null;
  }
}
