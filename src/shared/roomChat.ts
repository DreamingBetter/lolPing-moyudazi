export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_TEXT_MAX_CODE_POINTS = 1000;
export const CHAT_OUTGOING_RATE = 3;
export const CHAT_OUTGOING_BURST = 6;
export const CHAT_INCOMING_RATE = 5;
export const CHAT_INCOMING_BURST = 10;

export type ChatSendStatus = 'sending' | 'sent' | 'failed';
export type ChatError = 'not-in-room' | 'empty' | 'too-long' | 'failed';
export type ChatSendResult = { ok: true; id: string } | { ok: false; error: ChatError };

export interface RoomChatMessage {
  id: string;
  peer: string;
  name: string;
  color: number;
  ts: number;
  text: string;
  self: boolean;
  status?: ChatSendStatus;
}

export interface RoomChatState {
  phase: 'idle' | 'joining' | 'active';
  code: string | null;
  members: number;
  messages: RoomChatMessage[];
}

export interface ChatHistoryItem {
  id: string;
  peer: string;
  ts: number;
  name: string;
  color: number;
  text: string;
}
