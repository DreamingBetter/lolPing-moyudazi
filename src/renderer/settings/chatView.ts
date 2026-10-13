import type { RoomMember } from '../../shared/room';
import type { RoomChatMessage } from '../../shared/roomChat';

export interface ChatKeyDown {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
}

export interface ChatMessageView {
  name: string;
  color: number;
}

export const CHAT_COMPOSER_HEIGHT = { default: 104, min: 104, max: 220, step: 12 } as const;

const clampChatComposerHeight = (height: number): number => (
  Math.max(CHAT_COMPOSER_HEIGHT.min, Math.min(CHAT_COMPOSER_HEIGHT.max, Math.round(height)))
);

export function shouldSendChatOnKeyDown(e: ChatKeyDown): boolean {
  return e.key === 'Enter' && !e.shiftKey && e.isComposing !== true;
}

export function resolveChatMessageView(message: RoomChatMessage, members: readonly RoomMember[]): ChatMessageView {
  const member = members.find((m) => m.peer === message.peer);
  return member ? { name: member.name, color: member.color } : { name: message.name, color: message.color };
}

export function chatMessageNameLabel(view: ChatMessageView): string {
  return `${view.name}:`;
}

export function shouldShowChatRetry(message: RoomChatMessage): boolean {
  return message.self && message.status === 'failed';
}

export function resizeChatComposerHeight(startHeight: number, startY: number, currentY: number): number {
  return clampChatComposerHeight(startHeight - (currentY - startY));
}
