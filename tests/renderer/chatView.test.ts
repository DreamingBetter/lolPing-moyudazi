import { describe, expect, it } from 'vitest';
import type { RoomMember } from '../../src/shared/room';
import type { RoomChatMessage } from '../../src/shared/roomChat';
import {
  resizeChatComposerHeight,
  chatMessageNameLabel,
  resolveChatMessageView,
  shouldSendChatOnKeyDown,
  shouldShowChatRetry,
} from '../../src/renderer/settings/chatView';

const member = (peer: string, name: string, color: number): RoomMember => ({
  peer,
  name,
  color,
  path: 'lan',
  status: 'on',
  needsUpdate: false,
  noEmotes: false,
  muted: false,
  heartsteelBonusHealth: 0,
  heartsteelMaxHealth: 2000,
  self: false,
});

const message = (peer: string, name: string, color: number): RoomChatMessage => ({
  id: `${peer}${peer}`.slice(0, 32).padEnd(32, '0'),
  peer,
  name,
  color,
  ts: 1,
  text: 'hello',
  self: false,
});

describe('chat view helpers', () => {
  it('sends on Enter while preserving Shift+Enter for new lines and IME composition', () => {
    expect(shouldSendChatOnKeyDown({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true);
    expect(shouldSendChatOnKeyDown({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false);
    expect(shouldSendChatOnKeyDown({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false);
    expect(shouldSendChatOnKeyDown({ key: 'a', shiftKey: false, isComposing: false })).toBe(false);
  });

  it('uses current room member names for old chat messages, with the message snapshot as fallback', () => {
    const alexBeforeRename = message('1111111111111111', 'Alex', 2);
    const offline = message('2222222222222222', 'Offline name', 4);
    const members = [member('1111111111111111', 'Renamed Alex', 6)];

    expect(resolveChatMessageView(alexBeforeRename, members)).toMatchObject({ name: 'Renamed Alex', color: 6 });
    expect(resolveChatMessageView(offline, members)).toMatchObject({ name: 'Offline name', color: 4 });
  });

  it('formats the sender label with a colon', () => {
    expect(chatMessageNameLabel({ name: 'Alex', color: 2 })).toBe('Alex:');
  });

  it('only shows retry for failed local messages', () => {
    expect(shouldShowChatRetry({ ...message('me', 'Me', 1), self: true, status: 'failed' })).toBe(true);
    expect(shouldShowChatRetry({ ...message('me', 'Me', 1), self: true, status: 'sent' })).toBe(false);
    expect(shouldShowChatRetry({ ...message('peer', 'Alex', 2), self: false, status: 'failed' })).toBe(false);
  });

  it('resizes the chat composer by dragging the divider without shrinking below the default height', () => {
    expect(resizeChatComposerHeight(104, 300, 260)).toBe(144);
    expect(resizeChatComposerHeight(104, 300, 360)).toBe(104);
    expect(resizeChatComposerHeight(104, 300, 100)).toBe(220);
  });
});
