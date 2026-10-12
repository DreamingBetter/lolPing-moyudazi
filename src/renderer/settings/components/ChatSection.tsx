import { Button, Spinner, Textarea, Tooltip } from '@fluentui/react-components';
import {
  ArrowClockwise24Regular, Chat24Regular, Copy24Regular, PeopleCommunity24Regular, Send24Regular,
} from '@fluentui/react-icons';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatError, RoomChatMessage } from '../../../shared/roomChat';
import { TAG_COLORS } from '../../../shared/roomColors';
import { api } from '../api';
import { useText } from '../text';
import { useChatState } from '../useChatState';
import { RoomJoinCard } from './RoomJoinCard';

function errorText(error: ChatError, t: ReturnType<typeof useText>): string {
  if (error === 'too-long') return t.chatTooLong;
  if (error === 'empty') return '';
  return t.chatSendError;
}

function ChatMessage({ message, onRetry }: { message: RoomChatMessage; onRetry(id: string): void }) {
  const t = useText();
  const time = useMemo(() => new Intl.DateTimeFormat(t.lang, { hour: '2-digit', minute: '2-digit' }).format(message.ts), [message.ts, t.lang]);
  const status = message.self && message.status ? {
    sending: t.chatSending,
    sent: t.chatSent,
    failed: t.chatFailed,
  }[message.status] : null;
  return (
    <div className={`chatMessage${message.self ? ' self' : ''}${message.status === 'failed' ? ' failed' : ''}`}>
      <div className="chatMessageMeta">
        <span className="chatName" style={{ color: TAG_COLORS[message.color] }}>{message.name}</span>
        <span>{time}</span>
        {status ? <span className="chatMessageStatus">{status}</span> : null}
        {message.self && message.status === 'failed' ? (
          <Tooltip content={t.chatRetry} relationship="label">
            <Button size="small" appearance="subtle" icon={<ArrowClockwise24Regular />} aria-label={t.chatRetry}
              onClick={() => onRetry(message.id)} />
          </Tooltip>
        ) : null}
      </div>
      <div className="chatMessageBody">{message.text}</div>
    </div>
  );
}

export function ChatSection({ onOpenRoom }: { onOpenRoom(): void }) {
  const t = useText();
  const chat = useChatState();
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const list = listRef.current;
    if (list && atBottom.current) list.scrollTop = list.scrollHeight;
  }, [chat?.messages.length]);

  if (chat === null) return null;

  const send = async () => {
    if (sending || !draft.trim()) return;
    setSending(true);
    setError(null);
    const result = await api.sendChat(draft);
    setSending(false);
    if (result.ok) setDraft('');
    else setError(errorText(result.error, t));
  };
  const retry = async (id: string) => {
    const result = await api.retryChat(id);
    if (!result.ok) setError(errorText(result.error, t));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || !(api.platform === 'mac' ? e.metaKey : e.ctrlKey)) return;
    e.preventDefault();
    void send();
  };
  const disabled = chat.phase !== 'active';

  if (chat.phase === 'idle') {
    return (
      <div className="chatEmpty">
        <div className="chatEmptyHead">
          <span className="icon"><Chat24Regular /></span>
          <div>
            <b>{t.chatEmptyTitle}</b>
            <span className="desc">{t.chatEmptyDesc}</span>
          </div>
        </div>
        <RoomJoinCard />
        <div className="chatEmptyActions">
          <Button onClick={onOpenRoom}>{t.chatOpenRoom}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="chatWindow">
      <div className="chatHead">
        <div className="chatHeadMeta">
          <span className="icon"><Chat24Regular /></span>
          <div>
            <b>{t.chatTitle}</b>
            <span className="roomCode">{chat.code}</span>
            <span className="desc">{chat.phase === 'joining' ? t.roomJoining : t.chatMembers(chat.members)}</span>
          </div>
        </div>
        <div className="chatHeadActions">
          {chat.phase === 'joining' ? <Spinner size="tiny" /> : null}
          <Tooltip content={t.chatCopyCode} relationship="label">
            <Button icon={<Copy24Regular />} aria-label={t.chatCopyCode}
              onClick={() => {
                void api.copyRoomCode();
                setCopied(true);
              }}>{copied ? t.chatCopied : t.chatCopyCode}</Button>
          </Tooltip>
          <Button icon={<PeopleCommunity24Regular />} onClick={onOpenRoom}>{t.chatOpenRoom}</Button>
        </div>
      </div>
      <div className="chatMessages" ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 48;
        }}>
        {chat.messages.length === 0 ? <div className="chatNoMessages">{t.chatNoMessages}</div> : null}
        {chat.messages.map((message) => <ChatMessage key={message.id} message={message} onRetry={retry} />)}
      </div>
      <div className="chatComposer">
        <Textarea value={draft} placeholder={t.chatPlaceholder} disabled={disabled || sending}
          resize="vertical" onChange={(_, d) => setDraft(d.value)} onKeyDown={onKeyDown} />
        <Button appearance="primary" icon={<Send24Regular />} disabled={disabled || sending || !draft.trim()} onClick={() => void send()}>
          {t.chatSend}
        </Button>
      </div>
      {error ? <div className="chatComposerError">{error}</div> : null}
      <p className="desc chatHistoryNote">{t.chatHistoryNote}</p>
    </div>
  );
}
