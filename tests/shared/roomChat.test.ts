import { describe, expect, it } from 'vitest';
import { CHAT_HISTORY_LIMIT, CHAT_TEXT_MAX_CODE_POINTS, type RoomChatState } from '../../src/shared/roomChat';

describe('room chat limits', () => {
  it('keeps history at 50 messages and text at 1000 code points', () => {
    expect(CHAT_HISTORY_LIMIT).toBe(50);
    expect(CHAT_TEXT_MAX_CODE_POINTS).toBe(1000);
  });

  it('describes an idle chat state without renderer-only fields', () => {
    const state: RoomChatState = { phase: 'idle', code: null, members: 0, messages: [] };
    expect(state).toEqual({ phase: 'idle', code: null, members: 0, messages: [] });
  });
});
