import { describe, expect, it } from 'vitest';
import { isTagColor, TAG_COLORS } from '../../src/shared/roomColors';
import {
  clampNameInput, decodeMessage, encodeMessage, isOlderThan, sanitizeChatText, sanitizeName, validateMessage, type ChatHistoryMsg,
  type ChatHistoryRequestMsg, type ChatMsg, type EmoteMsg, type HeartsteelClaimMsg, type HeartsteelHitMsg,
  type HeartsteelStateMsg, type HeartsteelTargetMsg, type PingMsg, type PresenceMsg, type RoomMessage,
} from '../../src/shared/roomProtocol';

const base = { peer: '0123456789abcdef', seq: 4, ts: 1_780_000_000_000 };
const presence: PresenceMsg = { ...base, t: 'presence', proto: 1, app: '0.3.0', name: 'Alex', color: 3, status: 'on' };
const ping: PingMsg = { ...base, t: 'ping', ping: 'danger', d: 2, x: 0.25, y: 1 };
const emote: EmoteMsg = { ...base, t: 'emote', e: 'gg', d: 2, x: 0.25, y: 1 };
const CUSTOM_REF = `c:${'0123456789abcdef'.repeat(2)}`;
const chat: ChatMsg = { ...base, t: 'chat', id: '0123456789abcdef0123456789abcdef', text: 'hello\nworld' };
const historyRequest: ChatHistoryRequestMsg = {
  ...base, t: 'chatHistoryRequest', request: 'fedcba9876543210fedcba9876543210',
};
const history: ChatHistoryMsg = {
  ...base,
  t: 'chatHistory',
  request: historyRequest.request,
  part: 0,
  total: 1,
  messages: [{ id: chat.id, peer: base.peer, ts: base.ts, name: 'Alex', color: 3, text: 'hello' }],
};
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
  damage: 245,
  bonusGain: 25,
  bonusHealth: 25,
};

describe('encode / decode', () => {
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

  it('rounds x and y to 4 decimals', () => {
    expect(decodeMessage(encodeMessage({ ...ping, x: 0.123456, y: 0.987654 }))).toMatchObject({ x: 0.1235, y: 0.9877 });
  });

  it('rounds an emote’s x and y to 4 decimals too', () => {
    expect(decodeMessage(encodeMessage({ ...emote, x: 0.123456, y: 0.987654 }))).toMatchObject({ x: 0.1235, y: 0.9877 });
  });

  it('rejects bytes that are not JSON', () => {
    expect(decodeMessage(new TextEncoder().encode('{nope'))).toBeNull();
  });
});

describe('validateMessage', () => {
  it.each([
    ['unknown type', { ...presence, t: 'hello' }],
    ['short peer', { ...presence, peer: 'abc' }],
    ['upper-case peer', { ...presence, peer: '0123456789ABCDEF' }],
    ['negative seq', { ...presence, seq: -1 }],
    ['fractional seq', { ...presence, seq: 1.5 }],
    ['unsafe seq', { ...presence, seq: 2 ** 60 }],
    ['NaN ts', { ...presence, ts: Number.NaN }],
    ['unknown ping', { ...ping, ping: 'hold' }],
    ['display 0', { ...ping, d: 0 }],
    ['display 17', { ...ping, d: 17 }],
    ['fractional display', { ...ping, d: 1.5 }],
    ['x below 0', { ...ping, x: -0.01 }],
    ['x above 1', { ...ping, x: 1.01 }],
    ['infinite y', { ...ping, y: Infinity }],
    ['string x', { ...ping, x: '0.5' }],
    ['colour 8', { ...presence, color: 8 }],
    ['colour -1', { ...presence, color: -1 }],
    ['colour as CSS', { ...presence, color: 'red' }],
    ['unknown status', { ...presence, status: 'away' }],
    ['huge app version', { ...presence, app: 'x'.repeat(65) }],
    ['name not a string', { ...presence, name: 42 }],
    ['fractional proto', { ...presence, proto: 1.5 }],
  ])('rejects %s', (_label, raw) => {
    expect(validateMessage(raw)).toBeNull();
  });

  it('rejects non-objects', () => {
    for (const raw of [null, undefined, 3, 'x', [], [presence]]) expect(validateMessage(raw)).toBeNull();
  });

  it('keeps known fields only', () => {
    expect(validateMessage({ ...ping, extra: 'ignored' })).toEqual(ping);
  });

  it('cannot pollute prototypes', () => {
    const raw = JSON.parse('{"t":"bye","peer":"0123456789abcdef","seq":1,"ts":1,"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}}}');
    expect(validateMessage(raw)).toEqual({ t: 'bye', peer: '0123456789abcdef', seq: 1, ts: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('accepts a presence from a newer protocol (the version check is the room’s job)', () => {
    expect(validateMessage({ ...presence, proto: 2 })).toEqual({ ...presence, proto: 2 });
  });

  it('sanitises the name', () => {
    expect(validateMessage({ ...presence, name: '‮Alex\u0000' })).toMatchObject({ name: 'Alex' });
  });
});

describe('chat messages', () => {
  it('sanitises valid multiline chat text and keeps known fields only', () => {
    expect(validateMessage({ ...chat, text: '  hello\r\nworld\rbye  ', extra: 'ignored' })).toEqual({
      ...chat,
      text: 'hello\nworld\nbye',
    });
  });

  it.each([
    ['invalid id', { ...chat, id: 'ABC' }],
    ['invalid request id', { ...historyRequest, request: 'not-an-id' }],
    ['empty text', { ...chat, text: ' \n\t ' }],
    ['too long', { ...chat, text: 'x'.repeat(1001) }],
    ['negative part', { ...history, part: -1 }],
    ['part after total', { ...history, part: 1, total: 1 }],
    ['zero total', { ...history, total: 0 }],
    ['too many parts', { ...history, total: 257 }],
    ['too many history items', {
      ...history,
      messages: Array.from({ length: 51 }, (_, i) => ({ ...history.messages[0], id: i.toString(16).padStart(32, '0') })),
    }],
    ['invalid history item id', { ...history, messages: [{ ...history.messages[0], id: 'bad' }] }],
    ['invalid history item peer', { ...history, messages: [{ ...history.messages[0], peer: 'bad' }] }],
    ['invalid history item timestamp', { ...history, messages: [{ ...history.messages[0], ts: -1 }] }],
    ['invalid history item name', { ...history, messages: [{ ...history.messages[0], name: 3 }] }],
    ['invalid history item colour', { ...history, messages: [{ ...history.messages[0], color: 99 }] }],
    ['invalid history item text', { ...history, messages: [{ ...history.messages[0], text: ' ' }] }],
  ])('rejects %s', (label, raw) => {
    if (label.startsWith('invalid history item')) {
      expect(validateMessage(raw)).toMatchObject({ t: 'chatHistory', messages: [] });
    } else {
      expect(validateMessage(raw)).toBeNull();
    }
  });

  it('drops dangerous chat characters and normalises line endings', () => {
    expect(sanitizeChatText('\u0000A\u0085\u200b\u200e\u202aB\u2028C\u2029D\r\nE\rF')).toBe('ABCD\nE\nF');
  });
});

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
    ['hit math mismatch', { ...heartsteelHit, damage: 999 }],
  ])('rejects %s', (_label, raw) => {
    expect(validateMessage(raw)).toBeNull();
  });
});

describe('emote messages', () => {
  it('validates a bundled and a custom emote, and round-trips them', () => {
    for (const e of ['gg', CUSTOM_REF]) {
      const m: EmoteMsg = { ...emote, e };
      expect(validateMessage(m)).toEqual(m);
      expect(decodeMessage(encodeMessage(m))).toEqual(m);
    }
  });

  it('accepts a well-formed slug this version does not know (a newer peer’s emote)', () => {
    expect(validateMessage({ ...emote, e: 'brand_new_2' })).toEqual({ ...emote, e: 'brand_new_2' });
  });

  it.each([
    ['empty ref', { ...emote, e: '' }],
    ['upper-case slug', { ...emote, e: 'GG' }],
    ['slug with a path', { ...emote, e: '../gg' }],
    ['slug over 40 characters', { ...emote, e: 'a'.repeat(41) }],
    ['short custom hash', { ...emote, e: 'c:0123' }],
    ['upper-case custom hash', { ...emote, e: `c:${'ABCDEF0123456789'.repeat(2)}` }],
    ['non-string ref', { ...emote, e: 7 }],
    ['missing ref', { ...emote, e: undefined }],
    ['display 0', { ...emote, d: 0 }],
    ['display 17', { ...emote, d: 17 }],
    ['x above 1', { ...emote, x: 1.5 }],
    ['x below 0', { ...emote, x: -0.01 }],
    ['infinite y', { ...emote, y: Infinity }],
    ['string y', { ...emote, y: '0.5' }],
  ])('rejects %s', (_label, raw) => {
    expect(validateMessage(raw)).toBeNull();
  });

  it('keeps known fields only', () => {
    expect(validateMessage({ ...emote, extra: 'ignored', ping: 'danger' })).toEqual(emote);
  });
});

describe('isOlderThan', () => {
  it('is true only for a plain x.y.z version that is lower', () => {
    expect(isOlderThan('0.4.0', '0.5.0')).toBe(true);
    expect(isOlderThan('0.4.9', '0.5.0')).toBe(true);
    expect(isOlderThan('0.5.0', '0.5.0')).toBe(false);
    expect(isOlderThan('0.5.1', '0.5.0')).toBe(false);
    expect(isOlderThan('1.0.0', '0.5.0')).toBe(false);
    expect(isOlderThan('0.10.0', '0.9.0')).toBe(false); // numbers, not text
    expect(isOlderThan('0.9.0', '0.10.0')).toBe(true);
  });

  it('is false for anything else, so an unknown build is never called old', () => {
    for (const app of ['room-peer', '0.4', '', '0.4.0-beta', 'v0.4.0', '0.4.0.1', '0.-4.0']) expect(isOlderThan(app, '0.5.0')).toBe(false);
  });
});

describe('sanitizeName', () => {
  it('strips control, bidi and zero-width characters', () => {
    expect(sanitizeName('\u0007A​l‪e⁦x\u007f\u0085﻿')).toBe('Alex');
  });

  it('strips line separators, Arabic letter mark, soft hyphen, Mongolian vowel separator, Hangul fillers and CGJ', () => {
    expect(sanitizeName('A l e؜x᠎­͏')).toBe('Alex');
    expect(sanitizeName('ᅟᅠㅤﾠ')).toBe('Player');
  });

    it('trims and cuts to 16 code points, counting an emoji as one', () => {
    expect(sanitizeName('  Bob  ')).toBe('Bob');
    expect(sanitizeName('🎮'.repeat(20))).toBe('🎮'.repeat(16));
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
  });

  it('cuts to a longer limit when asked', () => {
    expect(sanitizeName('x'.repeat(40), 'Player', 24)).toBe('x'.repeat(24));
    expect(sanitizeName('x'.repeat(40), 'Player', 24)).not.toBe(sanitizeName('x'.repeat(40)));
  });

  it('falls back when nothing is left', () => {
    expect(sanitizeName('   ')).toBe('Player');
    expect(sanitizeName('​', 'Darren')).toBe('Darren');
  });
});

describe('clampNameInput', () => {
  it('limits typing to 16 code points, so 16 emoji fit (a UTF-16 maxLength allowed only 8)', () => {
    expect(clampNameInput('🎮'.repeat(20))).toBe('🎮'.repeat(16));
    expect(clampNameInput('x'.repeat(20))).toHaveLength(16);
    expect(clampNameInput(' Bob ')).toBe(' Bob '); // no trimming while typing
  });
});

describe('tag colours', () => {
  it('has 8 distinct colours', () => {
    expect(TAG_COLORS).toHaveLength(8);
    expect(new Set(TAG_COLORS).size).toBe(8);
  });

  it('accepts palette indexes only', () => {
    expect(isTagColor(0)).toBe(true);
    expect(isTagColor(7)).toBe(true);
    for (const v of [8, -1, 1.5, '1', null]) expect(isTagColor(v)).toBe(false);
  });
});
