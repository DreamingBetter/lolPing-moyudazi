import { EventEmitter } from 'node:events';
import type { EmoteRef } from '../shared/emotes';
import {
  HEARTSTEEL_TARGET_INTERVAL_MS,
  HEARTSTEEL_TARGET_TTL_MS,
  calculateHeartsteelHitFromBonus,
  heartsteelMaxHealth,
  heartsteelSchedulerPeer,
  isHeartsteelTargetId,
  normalizeHeartsteelBonusHealth,
  type HeartsteelHit,
  type HeartsteelTarget,
} from '../shared/heartsteel';
import type { PingId } from '../shared/pings';
import type { JoinResult, MemberPath, RoomMember, RoomStateCore } from '../shared/room';
import {
  CHAT_HISTORY_LIMIT, CHAT_INCOMING_BURST, CHAT_INCOMING_RATE, CHAT_OUTGOING_BURST, CHAT_OUTGOING_RATE,
  type ChatHistoryItem, type ChatSendResult, type LiveChatMessage, type RoomChatMessage, type RoomChatState,
} from '../shared/roomChat';
import { formatRoomCode, makeRoomCode, parseRoomCode } from '../shared/roomCode';
import {
  decodeMessage, encodeMessage, isChatId, isChatTextTooLong, isOlderThan, PROTOCOL_VERSION, sanitizeChatText,
  type ChatHistoryMsg, type MemberStatus, type PresenceMsg, type RoomMessage,
} from '../shared/roomProtocol';
import { RateLimiter } from './rateLimiter';
import { ReplayGuard } from './replayGuard';
import { open, seal, type RoomKeys } from './roomCrypto';
import type { PeerKey, Transport, TransportStatus } from './transport';

export const MAX_MEMBERS = 8;
const SETTLE_MS = 3000;
/** Relays can take a while to answer: the "room full" check never waits longer than this after joining. */
const SETTLE_CAP_MS = 15_000;
const TICK_MS = 1000;
/** How often presence is re-announced on each transport. */
const PRESENCE_MS: Record<Transport['kind'], number> = { lan: 2000, internet: 10_000 };
/** How long a path counts as alive after the last packet over it. */
const ALIVE_MS: Record<Transport['kind'], number> = { lan: 6000, internet: 25_000 };
/** Silence before a member is dropped: longer once it was heard over the internet, where presence comes every 10 s. */
const DROP_MS: Record<Transport['kind'], number> = { lan: 15_000, internet: 30_000 };
/** Pings and emotes over relays, per sender: one publish reaches everyone, and public relays only tolerate so much (tools/relay-probe). */
export const RELAY_PING_RATE = 5;
export const RELAY_PING_BURST = 10;
const TRANSFER_RATE = 60;
/** Presence asked for on a shared transport (a change, a new link, a new member): at most this often. */
const SHARED_PRESENCE_MS = 1000;
/** The first app version that shows emotes. */
const EMOTES_SINCE = '0.5.0';
const UNREACHABLE_MS = 20_000;
const LONELY_MS = 20_000;
const STALE_STRIKES = 3;
/** A housekeeping tick this late means the computer slept: nobody was heard because we weren't listening. */
const SLEEP_GAP_MS = 5000;
/** How long the clock warning stays up after the last stale presence. */
const SKEW_HINT_MS = 30_000;
const CHAT_HISTORY_REQUEST_MS = 30_000;
const compareChatMessages = (a: { id: string; ts: number }, b: { id: string; ts: number }): number =>
  a.ts !== b.ts ? a.ts - b.ts : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export interface RemotePing {
  displayId: number;
  x: number;
  y: number;
  id: PingId;
  tag: { name: string; color: number };
}

export interface RemoteEmote {
  displayId: number;
  x: number;
  y: number;
  ref: EmoteRef;
  /** The sender, so their earlier emote can be replaced: everyone has one on screen at a time. */
  peer: string;
  tag: { name: string; color: number };
}

export type RoomToast =
  | { kind: 'joined' | 'left' | 'disconnected'; name: string }
  | { kind: 'joinedRoom'; code: string }
  | { kind: 'full' };

export interface RoomDeps {
  transports: Transport[];
  now(): number;
  randomBytes(n: number): Uint8Array;
  deriveKeys(canonical: string): Promise<RoomKeys>;
  appVersion: string;
  /** Read on every use, so settings changes apply at once. `limit`: incoming pings per second per member, 0 = unlimited. */
  profile(): { name: string; color: number; limit: number; heartsteelBonusHealth?: number };
  /** Display numbers that can receive shared room effects. */
  displayNumbers?(): readonly number[];
  /** Display number → where a ping for it lands here, or null to drop it. The hook share mode will replace. */
  resolveTarget(d: number): { displayId: number; width: number; height: number } | null;
  /** Hashes of the custom emotes currently announced by this peer. */
  announceEmotes?(): readonly string[];
}

interface Member {
  peer: string;
  name: string;
  color: number;
  status: MemberStatus;
  needsUpdate: boolean;
  noEmotes: boolean;
  muted: boolean;
  em: string[];
  heartsteelBonusHealth: number;
  firstSeen: number;
  /** Ever heard over the internet: dropped after the longer silence. */
  viaInternet: boolean;
  /** Per transport kind: the address it was last heard from, and when. */
  paths: Partial<Record<Transport['kind'], { key: PeerKey; seenAt: number }>>;
}

interface PendingHistory {
  received: Set<string>;
  totals: Map<string, number>;
  expiresAt: number;
}

const toHex = (b: Uint8Array): string => [...b].map((v) => v.toString(16).padStart(2, '0')).join('');

/**
 * The room: who is in it, what we send, and what we let through. Talks to the network only through transports,
 * which carry sealed packets. Events: 'state' (RoomStateCore), 'remotePing' (RemotePing), 'remoteEmote' (RemoteEmote), 'toast' (RoomToast),
 * 'saveCode' (canonical code | null: what "rejoin last room" should remember).
 */
export class RoomManager extends EventEmitter {
  /** Our peer ID: random per join, since a peer that said bye stays "gone" to the others for their whole session. */
  self: string;
  private phase: RoomStateCore['phase'] = 'idle';
  private code: string | null = null;
  private keys: RoomKeys | null = null;
  /** Bumped on every join and leave, so a join still deriving keys can tell it was cancelled. */
  private session = 0;
  private seq = 0;
  private members = new Map<string, Member>();
  private answered = new Set<PeerKey>();
  /** Per peer ID: stale presences seen, and when the last one came. Never turns into a member. */
  private staleStrikes = new Map<string, { count: number; at: number }>();
  private guard: ReplayGuard;
  private readonly limiter: RateLimiter;
  private readonly transferLimiter: RateLimiter;
  private paused = false;
  private roomMuted = false;
  private aloneSince: number | null = null;
  private lastPresence: Partial<Record<Transport['kind'], number>> = {};
  private ticker: NodeJS.Timeout | null = null;
  private lastTick = 0;
  /** When we last woke from sleep: members count as heard then, so they get a fresh grace period. */
  private wokeAt = 0;
  private settle: NodeJS.Timeout | null = null;
  /** The settle timer has been cut down from the cap to SETTLE_MS. */
  private settleShort = false;
  private joinedAt = 0;
  private lastState = '';
  private internetAllowed = true;
  /** The transports running for this room: all of them, except the internet one while it isn't allowed. */
  private readonly active = new Set<Transport>();
  private readonly relayCap: RateLimiter;
  private chatMessages: RoomChatMessage[] = [];
  private chatSeen = new Set<string>();
  private chatHistoryRequested = false;
  private pendingHistory = new Map<string, PendingHistory>();
  private readonly chatOutgoing: RateLimiter;
  private readonly chatIncoming: RateLimiter;
  private lastChatState = '';
  private heartsteelEnabled = false;
  private heartsteelTarget: HeartsteelTarget | null = null;
  private heartsteelLastHit: HeartsteelHit | null = null;
  private nextHeartsteelSpawnAt = 0;
  private heartsteelExpire: NodeJS.Timeout | null = null;
  private localHeartsteelTicker: NodeJS.Timeout | null = null;
  private readonly resolvedHeartsteelTargets = new Set<string>();
  /** A presence waiting out SHARED_PRESENCE_MS, per shared transport. */
  private readonly sharedTimers = new Map<Transport, NodeJS.Timeout>();

  constructor(private readonly deps: RoomDeps) {
    super();
    this.self = toHex(deps.randomBytes(8));
    this.guard = new ReplayGuard(deps.now);
    this.limiter = new RateLimiter(deps.now);
    this.transferLimiter = new RateLimiter(deps.now);
    this.relayCap = new RateLimiter(deps.now);
    this.chatOutgoing = new RateLimiter(deps.now);
    this.chatIncoming = new RateLimiter(deps.now);
    for (const t of deps.transports) {
      t.on('packet', (peer: PeerKey, packet: Uint8Array) => this.onPacket(t, peer, packet));
      t.on('peerGone', (peer: PeerKey) => this.onPeerGone(t, peer));
      t.on('status', (s: TransportStatus) => {
        // A fresh socket: tell everyone now rather than at the next round. Relays say so per relay, with linkUp.
        if (s === 'ok' && !t.shared) this.announce(t);
        this.checkSettle();
        this.emitState();
      });
      t.on('linkUp', () => this.announce(t));
    }
  }

  async create(): Promise<void> {
    await this.start(makeRoomCode(this.deps.randomBytes(9)));
  }

  async join(text: string): Promise<JoinResult> {
    const parsed = parseRoomCode(text);
    if (!parsed.ok) return parsed;
    return (await this.start(parsed.code)) ? { ok: true } : { ok: false, error: 'failed' };
  }

  /** Leaves the room and forgets it, so it isn't rejoined on the next launch. */
  leave(): void {
    if (this.phase === 'idle') return;
    this.stop({ keepHeartsteelEnabled: this.heartsteelEnabled });
    this.emit('saveCode', null);
  }

  /** Says bye on the way out, but keeps the code for "rejoin last room". */
  quit(): void {
    if (this.phase !== 'idle') this.stop({ keepHeartsteelEnabled: false });
    else this.resetHeartsteel(true);
  }

  sendPing(ping: PingId, shared: { d: number; x: number; y: number }): void {
    this.sendShared({ t: 'ping', ping, ...shared }, { respectPause: true, useRelayCap: true });
  }

  sendEmote(e: EmoteRef, shared: { d: number; x: number; y: number }): void {
    this.sendShared({ t: 'emote', e, ...shared }, { respectPause: true, useRelayCap: true });
  }

  routeKind(peer: string): 'lan' | 'shared' | null {
    const member = this.members.get(peer);
    const route = member && this.route(member);
    if (!route) return null;
    return route.transport.shared ? 'shared' : 'lan';
  }

  sendToLan(peer: string, body: Record<string, unknown>): void {
    if (this.phase === 'idle' || !this.keys) return;
    const member = this.members.get(peer);
    const route = member && this.route(member);
    if (!route || route.transport.shared) return;
    try { route.transport.sendTo(route.key, this.seal(body)); } catch { /* packet too large */ }
  }

  broadcastShared(body: Record<string, unknown>): void {
    if (this.phase === 'idle' || !this.keys) return;
    try {
      const packet = this.seal(body);
      for (const transport of this.active) if (transport.shared) transport.broadcast(packet);
    } catch { /* packet too large */ }
  }

  spareSharedToken(keep: number): boolean {
    if (this.phase === 'idle' || !this.keys) return false;
    if (this.relayCap.tokens('internet', RELAY_PING_RATE, RELAY_PING_BURST) < keep + 1) return false;
    return this.relayCap.allow('internet', RELAY_PING_RATE, RELAY_PING_BURST);
  }

  setHeartsteelEnabled(on: boolean): void {
    if (on === this.heartsteelEnabled) return;
    this.heartsteelEnabled = on;
    if (on) {
      this.nextHeartsteelSpawnAt = this.deps.now() + HEARTSTEEL_TARGET_INTERVAL_MS;
      this.startLocalHeartsteelTicker();
    } else {
      this.stopLocalHeartsteelTicker();
      this.nextHeartsteelSpawnAt = 0;
      this.clearHeartsteelTarget(null);
    }
    if (this.phase === 'active') {
      this.sendShared({ t: 'heartsteelState', enabled: on }, { respectPause: false, useRelayCap: false });
    }
    this.emitState();
  }

  claimHeartsteelTarget(id: string): void {
    if (!isHeartsteelTargetId(id) || !this.isCurrentHeartsteelTarget(id)) return;
    if (this.isHeartsteelScheduler()) {
      this.acceptHeartsteelClaim(this.self, id);
      return;
    }
    this.sendShared({ t: 'heartsteelClaim', id }, { respectPause: false, useRelayCap: false });
  }

  /** Sends a room packet over each member's current route, optionally applying ping/emote gates and relay caps. */
  private sendShared(
    body: Record<string, unknown>,
    options: { respectPause: boolean; useRelayCap: boolean },
  ): boolean {
    if (this.phase === 'idle' || !this.keys || (options.respectPause && this.paused)) return false;
    let packet: Buffer;
    try {
      packet = this.seal(body);
    } catch {
      return false;
    }
    const sharedRoutes = new Set<Transport>();
    let available = this.members.size === 0;
    for (const m of this.members.values()) {
      const route = this.route(m);
      if (!route) continue;
      available = true;
      if (route.transport.shared) sharedRoutes.add(route.transport);
      else route.transport.sendTo(route.key, packet);
    }
    for (const t of sharedRoutes) {
      if (!options.useRelayCap || this.relayCap.allow(t.kind, RELAY_PING_RATE, RELAY_PING_BURST)) t.broadcast(packet);
    }
    return available;
  }

  setStatusFlags(f: { paused: boolean; roomMuted: boolean }): void {
    if (f.paused === this.paused && f.roomMuted === this.roomMuted) return;
    this.paused = f.paused;
    this.roomMuted = f.roomMuted;
    this.announce();
    this.emitState();
  }

  muteMember(peer: string, on: boolean): void {
    const m = this.members.get(peer);
    if (!m) return;
    m.muted = on;
    this.emitState();
  }

  /**
   * "Allow internet connections". Turning it off mid-room sends no bye: a bye makes the others ignore our peer ID for
   * their whole session, LAN included. Members only reachable over the internet time out instead.
   */
  setInternetAllowed(on: boolean): void {
    if (on === this.internetAllowed) return;
    this.internetAllowed = on;
    const keys = this.keys;
    if (!keys) return; // idle, or still deriving keys: start() reads the flag
    for (const t of this.deps.transports) {
      if (t.kind !== 'internet') continue;
      if (on) {
        this.active.add(t);
        t.start(keys);
        this.announce(t);
        continue;
      }
      this.active.delete(t);
      this.cancelShared(t);
      t.stop();
      for (const m of this.members.values()) {
        const p = m.paths.internet;
        if (!p) continue;
        this.answered.delete(p.key);
        delete m.paths.internet;
      }
    }
    this.checkSettle();
    this.emitState();
  }

  /** Name or colour changed: tell everyone now. */
  profileChanged(): void {
    this.announce();
    this.emitState();
  }

  state(): RoomStateCore {
    const now = this.deps.now();
    const status = (kind: Transport['kind']): TransportStatus =>
      this.phase === 'idle' ? 'off' : ([...this.active].find((t) => t.kind === kind)?.status ?? 'off');
    const p = this.deps.profile();
    const selfBonus = normalizeHeartsteelBonusHealth(p.heartsteelBonusHealth);
    const self: RoomMember = {
      peer: this.self,
      name: p.name,
      color: p.color,
      path: 'lan',
      status: this.status(),
      needsUpdate: false,
      noEmotes: false,
      muted: false,
      heartsteelBonusHealth: selfBonus,
      heartsteelMaxHealth: heartsteelMaxHealth(selfBonus),
      self: true,
    };
    const members: RoomMember[] = [
      self,
      ...(this.phase === 'idle' ? [] : [
        ...[...this.members.values()].map((m) => ({
          peer: m.peer, name: m.name, color: m.color, path: this.path(m, now), status: m.status,
          needsUpdate: m.needsUpdate, noEmotes: m.noEmotes, muted: m.muted,
          heartsteelBonusHealth: m.heartsteelBonusHealth,
          heartsteelMaxHealth: heartsteelMaxHealth(m.heartsteelBonusHealth),
          self: false,
        })),
      ]),
    ];
    return {
      phase: this.phase,
      code: this.code ? formatRoomCode(this.code) : null,
      members,
      heartsteel: {
        enabled: this.heartsteelEnabled,
        target: this.heartsteelTarget ? { ...this.heartsteelTarget } : null,
        lastHit: this.heartsteelLastHit ? { ...this.heartsteelLastHit } : null,
      },
      lan: status('lan'),
      internet: status('internet'),
      lonely: this.aloneSince !== null && now - this.aloneSince >= LONELY_MS,
      clockSkew: [...this.staleStrikes.values()].some((s) => s.count >= STALE_STRIKES && now - s.at < SKEW_HINT_MS),
    };
  }

  chatState(): RoomChatState {
    return {
      phase: this.phase,
      code: this.code ? formatRoomCode(this.code) : null,
      members: this.phase === 'idle' ? 0 : this.members.size + 1,
      messages: this.chatMessages.map((m) => ({ ...m })),
    };
  }

  sendChat(text: string): ChatSendResult {
    if (this.phase !== 'active' || !this.keys) return { ok: false, error: 'not-in-room' };
    if (isChatTextTooLong(text)) return { ok: false, error: 'too-long' };
    const clean = sanitizeChatText(text);
    if (!clean) return { ok: false, error: 'empty' };
    if (!this.chatFits(clean)) return { ok: false, error: 'too-long' };
    if (!this.chatOutgoing.allow(this.self, CHAT_OUTGOING_RATE, CHAT_OUTGOING_BURST)) {
      return { ok: false, error: 'failed' };
    }
    const id = this.newChatId();
    const p = this.deps.profile();
    const message: RoomChatMessage = {
      id, peer: this.self, name: p.name, color: p.color, ts: this.deps.now(), text: clean, self: true, status: 'sending',
    };
    this.chatMessages.push(message);
    this.chatSeen.add(id);
    this.sortAndTrimChat();
    this.emitChatState();
    const sent = this.sendShared({ t: 'chat', id, text: clean }, { respectPause: false, useRelayCap: false });
    message.status = sent ? 'sent' : 'failed';
    this.emitChatState();
    if (sent) this.emitChatMessage(message);
    return sent ? { ok: true, id } : { ok: false, error: 'failed' };
  }

  retryChat(id: string): ChatSendResult {
    if (this.phase !== 'active' || !this.keys) return { ok: false, error: 'not-in-room' };
    const message = this.chatMessages.find((m) => m.self && m.id === id && m.status === 'failed');
    if (!message) return { ok: false, error: 'failed' };
    if (!this.chatOutgoing.allow(this.self, CHAT_OUTGOING_RATE, CHAT_OUTGOING_BURST)) {
      return { ok: false, error: 'failed' };
    }
    message.status = 'sending';
    this.emitChatState();
    const sent = this.sendShared({ t: 'chat', id: message.id, text: message.text }, { respectPause: false, useRelayCap: false });
    message.status = sent ? 'sent' : 'failed';
    this.emitChatState();
    if (sent) this.emitChatMessage(message);
    return sent ? { ok: true, id: message.id } : { ok: false, error: 'failed' };
  }

  /** False when the keys couldn't be derived: the room is back to idle. */
  private async start(code: string): Promise<boolean> {
    if (this.phase !== 'idle') this.leave();
    const keepHeartsteelEnabled = this.heartsteelEnabled;
    const session = ++this.session;
    this.self = toHex(this.deps.randomBytes(8));
    this.seq = 0;
    this.clearChat();
    this.resetHeartsteel(true, keepHeartsteelEnabled);
    this.phase = 'joining';
    this.code = code;
    this.guard = new ReplayGuard(this.deps.now);
    this.aloneSince = this.deps.now();
    this.emitState();
    this.emitChatState();
    let keys: RoomKeys;
    try {
      keys = await this.deps.deriveKeys(code);
    } catch {
      if (session === this.session) this.stop({ keepHeartsteelEnabled });
      return false;
    }
    if (session !== this.session) return true; // left while deriving
    this.keys = keys;
    this.joinedAt = this.lastTick = this.deps.now();
    this.settleShort = false;
    this.settle = setTimeout(() => this.settled(), SETTLE_CAP_MS);
    for (const t of this.deps.transports) if (t.kind !== 'internet' || this.internetAllowed) this.active.add(t);
    for (const t of this.active) t.start(keys);
    this.announce();
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.checkSettle();
    this.emitState();
    return true;
  }

  /**
   * "Room full" is judged 3 s after the relays have answered or given up, so members only reachable over the
   * internet count too; never later than SETTLE_CAP_MS after joining.
   */
  private checkSettle(): void {
    if (this.phase !== 'joining' || !this.settle || this.settleShort) return;
    if ([...this.active].some((t) => t.shared && (t.status === 'off' || t.status === 'starting'))) return;
    this.settleShort = true;
    clearTimeout(this.settle);
    this.settle = setTimeout(() => this.settled(), Math.min(SETTLE_MS, this.joinedAt + SETTLE_CAP_MS - this.deps.now()));
  }

  private settled(): void {
    this.settle = null;
    if (this.members.size >= MAX_MEMBERS) {
      this.stop();
      this.emit('toast', { kind: 'full' } satisfies RoomToast);
      return;
    }
    this.phase = 'active';
    if (this.heartsteelEnabled) {
      this.nextHeartsteelSpawnAt = this.deps.now() + HEARTSTEEL_TARGET_INTERVAL_MS;
      this.sendShared({ t: 'heartsteelState', enabled: true }, { respectPause: false, useRelayCap: false });
    }
    this.emit('saveCode', this.code);
    this.emit('toast', { kind: 'joinedRoom', code: formatRoomCode(this.code!) } satisfies RoomToast);
    this.emitState();
    this.emitChatState();
  }

  private stop(options: { keepHeartsteelEnabled: boolean } = { keepHeartsteelEnabled: false }): void {
    this.session++;
    if (this.keys) {
      const bye = this.seal({ t: 'bye' });
      for (const t of this.active) this.spread(t, bye);
      for (const t of this.active) t.stop();
    }
    this.active.clear();
    for (const t of [...this.sharedTimers.keys()]) this.cancelShared(t);
    if (this.ticker) clearInterval(this.ticker);
    if (this.settle) clearTimeout(this.settle);
    this.ticker = this.settle = null;
    this.phase = 'idle';
    this.code = this.keys = null;
    for (const peer of this.members.keys()) this.emit('memberGone', peer);
    this.members.clear();
    this.transferLimiter.clear();
    this.answered.clear();
    this.staleStrikes.clear();
    this.lastPresence = {};
    this.aloneSince = null;
    this.clearChat();
    this.resetHeartsteel(true, options.keepHeartsteelEnabled);
    this.startLocalHeartsteelTicker();
    this.emitState();
    this.emitChatState();
  }

  private tick(): void {
    const now = this.deps.now();
    if (now - this.lastTick > SLEEP_GAP_MS) this.wokeAt = now;
    this.lastTick = now;
    for (const [peer, s] of this.staleStrikes) if (now - s.at >= SKEW_HINT_MS) this.staleStrikes.delete(peer);
    for (const [request, pending] of this.pendingHistory) if (now >= pending.expiresAt) this.pendingHistory.delete(request);
    for (const m of [...this.members.values()]) {
      const heard = Math.max(...Object.values(m.paths).map((p) => p.seenAt), m.firstSeen, this.wokeAt);
      if (now - heard >= DROP_MS[m.viaInternet ? 'internet' : 'lan']) this.remove(m, 'disconnected');
    }
    for (const t of this.active) {
      if (now - (this.lastPresence[t.kind] ?? 0) >= PRESENCE_MS[t.kind]) this.sendPresence(t);
    }
    this.tickHeartsteel(now);
    this.emitState();
  }

  private onPacket(t: Transport, key: PeerKey, packet: Uint8Array): void {
    if (!this.keys) return;
    const plain = open(this.keys.msgKey, packet);
    const msg = plain && decodeMessage(plain);
    if (!msg || msg.peer === this.self) return;
    const verdict = this.guard.accept(msg.peer, msg.seq, msg.ts);
    if (verdict === 'stale') return this.onStale(msg);
    if (verdict !== 'ok') return;
    this.staleStrikes.delete(msg.peer);

    if (msg.t === 'presence') return this.onPresence(t, key, msg);
    const m = this.members.get(msg.peer);
    if (msg.t === 'bye') {
      this.guard.markGone(msg.peer);
      if (m) this.remove(m, 'left');
      return;
    }
    if (!m) return;
    this.heard(m, t, key);
    if (msg.t === 'chat') {
      this.receiveChat(m, msg.id, msg.ts, msg.text);
      return;
    }
    if (msg.t === 'chatHistoryRequest') {
      this.sendChatHistory(msg.request);
      return;
    }
    if (msg.t === 'chatHistory') {
      this.receiveChatHistory(m.peer, msg);
      return;
    }
    if (msg.t === 'heartsteelState') {
      this.receiveHeartsteelState(msg.enabled);
      return;
    }
    if (msg.t === 'heartsteelTarget') {
      this.receiveHeartsteelTarget(m.peer, {
        id: msg.id, d: msg.d, x: msg.x, y: msg.y, createdAt: msg.createdAt, expiresAt: msg.expiresAt,
      });
      return;
    }
    if (msg.t === 'heartsteelClaim') {
      if (this.isHeartsteelScheduler()) this.acceptHeartsteelClaim(m.peer, msg.id);
      return;
    }
    if (msg.t === 'heartsteelHit') {
      if (heartsteelSchedulerPeer(this.heartsteelPeers()) === m.peer) {
        this.applyHeartsteelHit({
          id: msg.id,
          winner: msg.winner,
          damage: msg.damage,
          bonusGain: msg.bonusGain,
          bonusHealth: msg.bonusHealth,
          ts: msg.ts,
        });
      }
      return;
    }
    if (msg.t === 'want' || msg.t === 'chunk') {
      if (this.paused || m.muted || m.needsUpdate || (msg.t === 'want' && msg.to !== this.self)) return;
      if (!this.transferLimiter.allow(m.peer, TRANSFER_RATE)) return;
      this.emit(msg.t, msg);
      return;
    }
    if (msg.t !== 'ping' && msg.t !== 'emote') return;
    // Pings and emotes pass the same gates and share one budget per member.
    if (this.paused || this.roomMuted || m.muted || m.needsUpdate) return;
    if (!this.limiter.allow(m.peer, this.deps.profile().limit)) return;
    const target = this.deps.resolveTarget(msg.d);
    if (!target) return;
    const [x, y] = [msg.x * target.width, msg.y * target.height];
    const tag = { name: m.name, color: m.color };
    if (msg.t === 'ping') this.emit('remotePing', { displayId: target.displayId, x, y, id: msg.ping, tag } satisfies RemotePing);
    else this.emit('remoteEmote', { displayId: target.displayId, x, y, ref: msg.e, peer: m.peer, tag } satisfies RemoteEmote);
  }

  private receiveChat(m: Member, id: string, ts: number, text: string): void {
    if (this.chatSeen.has(id)) return;
    if (!this.chatIncoming.allow(m.peer, CHAT_INCOMING_RATE, CHAT_INCOMING_BURST)) return;
    this.chatSeen.add(id);
    const message: RoomChatMessage = { id, peer: m.peer, name: m.name, color: m.color, ts, text, self: false };
    this.chatMessages.push(message);
    this.sortAndTrimChat();
    this.emitChatState();
    this.emitChatMessage(message);
  }

  private requestChatHistory(): void {
    if (this.chatHistoryRequested || !this.keys || this.phase === 'idle') return;
    const request = this.newChatId();
    this.chatHistoryRequested = true;
    this.pendingHistory.set(request, {
      received: new Set(),
      totals: new Map(),
      expiresAt: this.deps.now() + CHAT_HISTORY_REQUEST_MS,
    });
    this.sendShared({ t: 'chatHistoryRequest', request }, { respectPause: false, useRelayCap: false });
  }

  private sendChatHistory(request: string): void {
    if (!this.keys) return;
    const items = this.chatMessages
      .filter((m) => !m.self || m.status === 'sent')
      .map(({ id, peer, ts, name, color, text }): ChatHistoryItem => ({ id, peer, ts, name, color, text }))
      .sort(compareChatMessages)
      .slice(-CHAT_HISTORY_LIMIT);
    const parts: ChatHistoryItem[][] = [];
    let current: ChatHistoryItem[] = [];
    for (const item of items) {
      const candidate = [...current, item];
      if (this.chatHistoryFits(request, parts.length, 256, candidate)) {
        current = candidate;
        continue;
      }
      if (current.length > 0) parts.push(current);
      current = this.chatHistoryFits(request, parts.length, 256, [item]) ? [item] : [];
    }
    if (current.length > 0 || parts.length === 0) parts.push(current);
    const total = parts.length;
    parts.forEach((messages, part) => {
      this.sendShared({ t: 'chatHistory', request, part, total, messages }, { respectPause: false, useRelayCap: false });
    });
  }

  private receiveChatHistory(senderPeer: string, msg: ChatHistoryMsg): void {
    const pending = this.pendingHistory.get(msg.request);
    if (!pending || pending.expiresAt <= this.deps.now()) return;
    const previousTotal = pending.totals.get(senderPeer);
    if (previousTotal !== undefined && previousTotal !== msg.total) return;
    pending.totals.set(senderPeer, msg.total);
    const partKey = `${senderPeer}:${msg.part}`;
    if (pending.received.has(partKey)) return;
    pending.received.add(partKey);
    let changed = false;
    for (const item of msg.messages) {
      const existing = this.chatMessages.find((m) => m.id === item.id);
      if (existing) {
        if (existing.self && existing.status !== 'sent') {
          existing.status = 'sent';
          changed = true;
        }
        continue;
      }
      if (this.chatSeen.has(item.id)) continue;
      this.chatSeen.add(item.id);
      this.chatMessages.push({
        id: item.id,
        peer: item.peer,
        name: item.name,
        color: item.color,
        ts: item.ts,
        text: item.text,
        self: item.peer === this.self,
        status: item.peer === this.self ? 'sent' : undefined,
      });
      changed = true;
    }
    if (changed) {
      this.sortAndTrimChat();
      this.emitChatState();
    }
  }

  private chatFits(text: string): boolean {
    if (!this.keys) return false;
    const peer = 'f'.repeat(16);
    const id = 'f'.repeat(32);
    const max = Number.MAX_SAFE_INTEGER;
    try {
      seal(this.keys.msgKey, encodeMessage({ t: 'chat', peer, seq: max, ts: max, id, text }));
      seal(this.keys.msgKey, encodeMessage({
        t: 'chatHistory',
        peer,
        seq: max,
        ts: max,
        request: id,
        part: 255,
        total: 256,
        messages: [{ id, peer, ts: max, name: 'x'.repeat(16), color: 7, text }],
      }));
      return true;
    } catch {
      return false;
    }
  }

  private chatHistoryFits(request: string, part: number, total: number, messages: ChatHistoryItem[]): boolean {
    if (!this.keys) return false;
    try {
      seal(this.keys.msgKey, encodeMessage({
        t: 'chatHistory',
        peer: 'f'.repeat(16),
        seq: Number.MAX_SAFE_INTEGER,
        ts: Number.MAX_SAFE_INTEGER,
        request,
        part,
        total,
        messages,
      }));
      return true;
    } catch {
      return false;
    }
  }

  private newChatId(): string {
    const bytes = this.deps.randomBytes(16);
    let id = toHex(bytes);
    let counter = this.seq + 1;
    while (!isChatId(id) || this.chatSeen.has(id) || this.pendingHistory.has(id)) {
      const fallback = new Uint8Array(bytes);
      const n = counter >>> 0;
      for (let i = 0; i < 4; i++) fallback[12 + i] = (n >>> (24 - i * 8)) & 0xff;
      id = toHex(fallback);
      counter++;
    }
    return id;
  }

  private clearChat(): void {
    this.chatMessages = [];
    this.chatSeen.clear();
    this.chatHistoryRequested = false;
    this.pendingHistory.clear();
    this.chatOutgoing.clear();
    this.chatIncoming.clear();
    this.lastChatState = '';
  }

  private sortAndTrimChat(): void {
    this.chatMessages.sort(compareChatMessages);
    if (this.chatMessages.length > CHAT_HISTORY_LIMIT) this.chatMessages.splice(0, this.chatMessages.length - CHAT_HISTORY_LIMIT);
  }

  private onPresence(t: Transport, key: PeerKey, msg: PresenceMsg): void {
    let m = this.members.get(msg.peer);
    const isNew = !m;
    if (!m) {
      m = {
        peer: msg.peer, name: msg.name, color: msg.color, status: msg.status, needsUpdate: false, noEmotes: false, muted: false,
        em: [], heartsteelBonusHealth: normalizeHeartsteelBonusHealth(msg.heartsteelBonusHealth),
        firstSeen: this.deps.now(), viaInternet: false, paths: {},
      };
      this.members.set(m.peer, m);
      this.aloneSince = null;
    }
    m.name = msg.name;
    m.color = msg.color;
    m.status = msg.status;
    m.heartsteelBonusHealth = normalizeHeartsteelBonusHealth(msg.heartsteelBonusHealth);
    m.needsUpdate = msg.proto !== PROTOCOL_VERSION;
    m.noEmotes = isOlderThan(msg.app, EMOTES_SINCE);
    m.em = msg.em ?? [];
    if (!this.paused) this.emit('emotes', m.peer, [...m.em]);
    this.heard(m, t, key);
    if (!this.answered.has(key)) {
      this.answered.add(key);
      if (t.shared) this.announce(t); // everyone hears it anyway, so it's an ordinary presence
      else t.sendTo(key, this.presencePacket());
    }
    if (isNew && this.phase === 'active') this.emit('toast', { kind: 'joined', name: m.name } satisfies RoomToast);
    if (isNew && this.phase === 'joining' && !this.chatHistoryRequested) this.requestChatHistory();
    this.emitState();
    this.emitChatState();
  }

  /**
   * Packets more than 10 minutes off our clock. Anyone on the network can replay old ones, so they never create,
   * refresh or reach a member; a few presences only raise the room-level clock warning.
   */
  private onStale(msg: RoomMessage): void {
    if (msg.t !== 'presence') return;
    const s = this.staleStrikes.get(msg.peer) ?? { count: 0, at: 0 };
    this.staleStrikes.set(msg.peer, { count: s.count + 1, at: this.deps.now() });
    this.emitState();
  }

  private onPeerGone(t: Transport, key: PeerKey): void {
    for (const m of this.members.values()) if (m.paths[t.kind]?.key === key) delete m.paths[t.kind];
    this.answered.delete(key);
    this.emitState();
  }

  private heard(m: Member, t: Transport, key: PeerKey): void {
    m.paths[t.kind] = { key, seenAt: this.deps.now() };
    if (t.kind === 'internet') m.viaInternet = true;
  }

  private remove(m: Member, kind: 'left' | 'disconnected'): void {
    this.members.delete(m.peer);
    this.limiter.forget(m.peer);
    this.transferLimiter.forget(m.peer);
    this.chatIncoming.forget(m.peer);
    for (const p of Object.values(m.paths)) this.answered.delete(p.key);
    if (this.members.size === 0 && this.phase !== 'idle') this.aloneSince = this.deps.now();
    if (this.heartsteelEnabled && !this.heartsteelTarget && this.isHeartsteelScheduler()) {
      this.nextHeartsteelSpawnAt = Math.min(this.nextHeartsteelSpawnAt || Infinity, this.deps.now() + HEARTSTEEL_TARGET_INTERVAL_MS);
    }
    this.emit('toast', { kind, name: m.name } satisfies RoomToast);
    this.emit('memberGone', m.peer);
    this.emitState();
    this.emitChatState();
  }

  /** LAN while it is alive, else internet, else nothing. */
  private route(m: Member): { transport: Transport; key: PeerKey } | null {
    const now = this.deps.now();
    for (const kind of ['lan', 'internet'] as const) {
      const p = m.paths[kind];
      const transport = [...this.active].find((t) => t.kind === kind);
      if (p && transport && now - p.seenAt < ALIVE_MS[kind]) return { transport, key: p.key };
    }
    return null;
  }

  private path(m: Member, now: number): MemberPath {
    const r = this.route(m);
    if (r) return r.transport.kind;
    return now - m.firstSeen < UNREACHABLE_MS ? 'connecting' : 'unreachable';
  }

  private status(): MemberStatus {
    return this.paused ? 'paused' : this.roomMuted ? 'muted' : 'on';
  }

  private presencePacket(): Buffer {
    const p = this.deps.profile();
    return this.seal({
      t: 'presence',
      proto: PROTOCOL_VERSION,
      app: this.deps.appVersion,
      name: p.name,
      color: p.color,
      status: this.status(),
      em: [...(this.deps.announceEmotes?.() ?? [])],
      heartsteelBonusHealth: normalizeHeartsteelBonusHealth(p.heartsteelBonusHealth),
    });
  }

  private tickHeartsteel(now: number): void {
    if (!this.heartsteelEnabled || this.phase === 'joining') return;
    if (this.heartsteelTarget && now >= this.heartsteelTarget.expiresAt) this.expireHeartsteelTarget(this.heartsteelTarget.id);
    if (this.heartsteelTarget || (this.phase === 'active' && !this.isHeartsteelScheduler())) return;
    if (this.nextHeartsteelSpawnAt === 0) this.nextHeartsteelSpawnAt = now + HEARTSTEEL_TARGET_INTERVAL_MS;
    if (now < this.nextHeartsteelSpawnAt) return;
    const target = this.newHeartsteelTarget(now);
    if (this.phase === 'active') this.publishHeartsteelTarget(target);
    else this.setHeartsteelTarget(target);
  }

  private receiveHeartsteelState(enabled: boolean): void {
    if (enabled === this.heartsteelEnabled) return;
    this.heartsteelEnabled = enabled;
    if (enabled) this.nextHeartsteelSpawnAt = this.deps.now() + HEARTSTEEL_TARGET_INTERVAL_MS;
    else this.clearHeartsteelTarget(null);
    this.emitState();
  }

  private receiveHeartsteelTarget(peer: string, target: HeartsteelTarget): void {
    if (!this.heartsteelEnabled || heartsteelSchedulerPeer(this.heartsteelPeers()) !== peer) return;
    if (this.resolvedHeartsteelTargets.has(target.id)) return;
    this.setHeartsteelTarget(target);
  }

  private acceptHeartsteelClaim(winner: string, id: string): void {
    if (!this.isCurrentHeartsteelTarget(id) || this.resolvedHeartsteelTargets.has(id)) return;
    const profile = this.deps.profile();
    const member = winner === this.self ? null : this.members.get(winner);
    if (winner !== this.self && !member) return;
    const bonusBefore = winner === this.self ? normalizeHeartsteelBonusHealth(profile.heartsteelBonusHealth) : member!.heartsteelBonusHealth;
    const result = calculateHeartsteelHitFromBonus(bonusBefore);
    const bonusHealth = normalizeHeartsteelBonusHealth(bonusBefore + result.bonusGain);
    this.sendShared(
      { t: 'heartsteelHit', id, winner, damage: result.damage, bonusGain: result.bonusGain, bonusHealth },
      { respectPause: false, useRelayCap: false },
    );
    this.applyHeartsteelHit({
      id,
      winner,
      damage: result.damage,
      bonusGain: result.bonusGain,
      bonusHealth,
      ts: this.deps.now(),
    });
  }

  private applyHeartsteelHit(hit: Omit<HeartsteelHit, 'winnerName' | 'winnerColor' | 'maxHealth'>): void {
    if (!this.isCurrentHeartsteelTarget(hit.id) || this.resolvedHeartsteelTargets.has(hit.id)) return;
    const profile = this.deps.profile();
    const member = hit.winner === this.self ? null : this.members.get(hit.winner);
    if (hit.winner !== this.self && !member) return;
    const winnerName = hit.winner === this.self ? profile.name : member!.name;
    const winnerColor = hit.winner === this.self ? profile.color : member!.color;
    const full: HeartsteelHit = {
      ...hit,
      bonusHealth: normalizeHeartsteelBonusHealth(hit.bonusHealth),
      winnerName,
      winnerColor,
      maxHealth: heartsteelMaxHealth(hit.bonusHealth),
    };
    this.resolvedHeartsteelTargets.add(hit.id);
    this.heartsteelLastHit = full;
    if (hit.winner === this.self) this.emit('heartsteelBonusHealth', full.bonusHealth);
    else member!.heartsteelBonusHealth = full.bonusHealth;
    this.emit('heartsteelHit', { ...full } satisfies HeartsteelHit);
    this.clearHeartsteelTarget({ id: hit.id });
    this.emitState();
  }

  private heartsteelPeers(): string[] {
    return [this.self, ...this.members.keys()];
  }

  private isHeartsteelScheduler(): boolean {
    return heartsteelSchedulerPeer(this.heartsteelPeers()) === this.self;
  }

  private isCurrentHeartsteelTarget(id: string): boolean {
    return this.heartsteelEnabled
      && this.heartsteelTarget?.id === id
      && this.deps.now() <= this.heartsteelTarget.expiresAt;
  }

  private newHeartsteelTarget(now: number): HeartsteelTarget {
    const id = toHex(this.deps.randomBytes(16));
    const displays = this.deps.displayNumbers?.() ?? [1];
    const d = displays.length > 0 ? displays[this.deps.randomBytes(1)[0] % displays.length] : 1;
    const bytes = this.deps.randomBytes(4);
    const unit = (hi: number, lo: number): number => 0.08 + (((hi << 8) | lo) / 0xffff) * 0.84;
    return { id, d, x: unit(bytes[0], bytes[1]), y: unit(bytes[2], bytes[3]), createdAt: now, expiresAt: now + HEARTSTEEL_TARGET_TTL_MS };
  }

  private publishHeartsteelTarget(target: HeartsteelTarget): void {
    this.setHeartsteelTarget(target);
    this.sendShared({ t: 'heartsteelTarget', ...target }, { respectPause: false, useRelayCap: false });
  }

  private setHeartsteelTarget(target: HeartsteelTarget): void {
    this.clearHeartsteelExpiry();
    this.heartsteelTarget = { ...target };
    this.nextHeartsteelSpawnAt = target.createdAt + HEARTSTEEL_TARGET_INTERVAL_MS;
    this.heartsteelExpire = setTimeout(() => this.expireHeartsteelTarget(target.id), Math.max(0, target.expiresAt - this.deps.now()));
    this.emit('heartsteelTarget', { ...target } satisfies HeartsteelTarget);
    this.emitState();
  }

  private expireHeartsteelTarget(id: string): void {
    if (!this.heartsteelTarget || this.heartsteelTarget.id !== id) return;
    const next = this.heartsteelTarget.createdAt + HEARTSTEEL_TARGET_INTERVAL_MS;
    this.clearHeartsteelTarget({ id });
    this.nextHeartsteelSpawnAt = Math.max(next, this.deps.now());
  }

  private clearHeartsteelTarget(payload: { id: string } | null): void {
    this.clearHeartsteelExpiry();
    this.heartsteelTarget = null;
    this.emit('heartsteelClear', payload);
  }

  private clearHeartsteelExpiry(): void {
    if (this.heartsteelExpire) clearTimeout(this.heartsteelExpire);
    this.heartsteelExpire = null;
  }

  private startLocalHeartsteelTicker(): void {
    if (!this.heartsteelEnabled || this.phase !== 'idle' || this.localHeartsteelTicker) return;
    if (this.nextHeartsteelSpawnAt === 0) this.nextHeartsteelSpawnAt = this.deps.now() + HEARTSTEEL_TARGET_INTERVAL_MS;
    this.localHeartsteelTicker = setInterval(() => {
      this.tickHeartsteel(this.deps.now());
      this.emitState();
    }, TICK_MS);
  }

  private stopLocalHeartsteelTicker(): void {
    if (this.localHeartsteelTicker) clearInterval(this.localHeartsteelTicker);
    this.localHeartsteelTicker = null;
  }

  private resetHeartsteel(emitClear: boolean, keepEnabled = false): void {
    this.stopLocalHeartsteelTicker();
    this.clearHeartsteelExpiry();
    const hadTarget = this.heartsteelTarget !== null;
    this.heartsteelEnabled = keepEnabled;
    this.heartsteelTarget = null;
    this.heartsteelLastHit = null;
    this.nextHeartsteelSpawnAt = keepEnabled ? this.deps.now() + HEARTSTEEL_TARGET_INTERVAL_MS : 0;
    this.resolvedHeartsteelTargets.clear();
    if (emitClear && hadTarget) this.emit('heartsteelClear', null);
  }

  /**
   * Presence on one transport, or on every running one. A shared transport sends at most once a second: the first
   * request goes out at once, later ones in that second become one presence at its end, with the latest state.
   */
  private announce(only?: Transport): void {
    if (!this.keys) return;
    for (const t of only ? [only] : [...this.active]) {
      if (!this.active.has(t)) continue;
      if (!t.shared) {
        this.sendPresence(t);
        continue;
      }
      const wait = (this.lastPresence[t.kind] ?? -Infinity) + SHARED_PRESENCE_MS - this.deps.now();
      if (wait <= 0) this.sendPresence(t);
      else if (!this.sharedTimers.has(t)) {
        this.sharedTimers.set(t, setTimeout(() => {
          this.sharedTimers.delete(t);
          if (this.keys && this.active.has(t)) this.sendPresence(t);
        }, wait));
      }
    }
  }

  private sendPresence(t: Transport): void {
    this.cancelShared(t);
    this.spread(t, this.presencePacket());
    this.lastPresence[t.kind] = this.deps.now();
  }

  private cancelShared(t: Transport): void {
    const timer = this.sharedTimers.get(t);
    if (timer) clearTimeout(timer);
    this.sharedTimers.delete(t);
  }

  /**
   * Broadcast, and on LAN also straight to every member heard there: Wi-Fi broadcast has no retries and some
   * routers filter it, unicast doesn't. Duplicates are dropped by the receiver's replay guard.
   */
  private spread(t: Transport, packet: Uint8Array): void {
    t.broadcast(packet);
    if (t.shared) return; // one send already reached everyone
    for (const m of this.members.values()) {
      const key = m.paths.lan?.key;
      if (key) t.sendTo(key, packet);
    }
  }

  private seal(body: Record<string, unknown>): Buffer {
    const msg = { peer: this.self, seq: ++this.seq, ts: this.deps.now(), ...body } as RoomMessage;
    return seal(this.keys!.msgKey, encodeMessage(msg));
  }

  private emitState(): void {
    const s = this.state();
    const json = JSON.stringify(s);
    if (json === this.lastState) return;
    this.lastState = json;
    this.emit('state', s);
  }

  private emitChatState(): void {
    const s = this.chatState();
    const json = JSON.stringify(s);
    if (json === this.lastChatState) return;
    this.lastChatState = json;
    this.emit('chatState', s);
  }

  private emitChatMessage(message: RoomChatMessage): void {
    const { id, peer, name, color, ts, text, self } = message;
    this.emit('chatMessage', { id, peer, name, color, ts, text, self } satisfies LiveChatMessage);
  }
}
