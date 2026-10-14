import { Button, Dropdown, Option, Spinner, Textarea, Tooltip } from '@fluentui/react-components';
import {
  Chat24Regular, Copy24Regular, DataPie24Regular, ErrorCircle24Regular, PeopleCommunity24Regular, ResizeLarge24Regular, Send24Regular,
  TopSpeed24Regular,
} from '@fluentui/react-icons';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { ChatError, RoomChatMessage } from '../../../shared/roomChat';
import type { RoomMember } from '../../../shared/room';
import { TAG_COLORS } from '../../../shared/roomColors';
import {
  CHAT_DANMAKU_AREAS, CHAT_DANMAKU_SPEEDS, type ChatDanmakuArea, type ChatDanmakuSpeed, type Settings,
} from '../../../shared/settings';
import { api } from '../api';
import {
  CHAT_COMPOSER_HEIGHT, chatMessageNameLabel, resizeChatComposerHeight, resolveChatMessageView, shouldSendChatOnKeyDown,
  shouldShowChatRetry,
} from '../chatView';
import { useText } from '../text';
import type { Update } from '../useAppState';
import { useChatState } from '../useChatState';
import { useRoomState } from '../useRoomState';
import { RoomJoinCard } from './RoomJoinCard';
import { SettingRow, SliderRow, SwitchRow } from './rows';

function errorText(error: ChatError, t: ReturnType<typeof useText>): string {
  if (error === 'too-long') return t.chatTooLong;
  if (error === 'empty') return '';
  return t.chatSendError;
}

function ChatMessage({ message, members, onRetry }: { message: RoomChatMessage; members: readonly RoomMember[]; onRetry(id: string): void }) {
  const t = useText();
  const time = useMemo(() => new Intl.DateTimeFormat(t.lang, { hour: '2-digit', minute: '2-digit' }).format(message.ts), [message.ts, t.lang]);
  const view = useMemo(() => resolveChatMessageView(message, members), [members, message]);
  return (
    <div className={`chatMessage${message.self ? ' self' : ''}${message.status === 'failed' ? ' failed' : ''}`} tabIndex={0}>
      <span className="chatName" style={{ color: TAG_COLORS[view.color] }}>{chatMessageNameLabel(view)}</span>
      <div className="chatMessageLine">
        <div className="chatMessageBubble">
          <div className="chatMessageBody">{message.text}</div>
          <time className="chatMessageTime" dateTime={new Date(message.ts).toISOString()}>{time}</time>
        </div>
        {shouldShowChatRetry(message) ? (
          <Tooltip content={t.chatRetry} relationship="label">
            <Button className="chatRetryButton" size="small" appearance="subtle" icon={<ErrorCircle24Regular />} aria-label={t.chatRetry}
              onClick={() => onRetry(message.id)} />
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

const areaLabels = (t: ReturnType<typeof useText>): Record<ChatDanmakuArea, string> => ({
  quarter: t.chatDanmakuAreaQuarter,
  half: t.chatDanmakuAreaHalf,
  threeQuarter: t.chatDanmakuAreaThreeQuarter,
  full: t.chatDanmakuAreaFull,
});

const speedLabels = (t: ReturnType<typeof useText>): Record<ChatDanmakuSpeed, string> => ({
  slow: t.chatDanmakuSpeedSlow,
  normal: t.chatDanmakuSpeedNormal,
  fast: t.chatDanmakuSpeedFast,
});

export function ChatSection({ onOpenRoom, settings, update }: { onOpenRoom(): void; settings: Settings; update: Update }) {
  const t = useText();
  const chat = useChatState();
  const room = useRoomState();
  const listRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState('');
  const [composerHeight, setComposerHeight] = useState<number>(CHAT_COMPOSER_HEIGHT.default);
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
    if (!shouldSendChatOnKeyDown({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) return;
    e.preventDefault();
    void send();
  };
  const onComposerResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = composerHeight;
    document.body.classList.add('chatComposerResizing');
    const onMove = (event: PointerEvent) => setComposerHeight(resizeChatComposerHeight(startHeight, startY, event.clientY));
    const onEnd = () => {
      document.body.classList.remove('chatComposerResizing');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onEnd);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onEnd);
  };
  const onComposerResizeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setComposerHeight((height) => resizeChatComposerHeight(height, 0, e.key === 'ArrowUp' ? -CHAT_COMPOSER_HEIGHT.step : CHAT_COMPOSER_HEIGHT.step));
  };
  const disabled = chat.phase !== 'active';
  const members = room?.members ?? [];
  const areas = areaLabels(t);
  const speeds = speedLabels(t);
  const danmakuDisabled = !settings.chatDanmakuEnabled;
  const danmakuSettings = (
    <div className="chatDanmakuSettings">
      <div className="chatSettingsTitle">{t.chatDanmaku}</div>
      <SwitchRow icon={<Chat24Regular />} title={t.chatDanmakuShow} description={t.chatDanmakuShowDesc}
        checked={settings.chatDanmakuEnabled} onChange={(v) => void update({ chatDanmakuEnabled: v })} />
      <SettingRow icon={<DataPie24Regular />} title={t.chatDanmakuArea} dim={danmakuDisabled}>
        <Dropdown
          style={{ minWidth: 160 }}
          value={areas[settings.chatDanmakuArea]}
          selectedOptions={[settings.chatDanmakuArea]}
          onOptionSelect={(_, d) => { if (d.optionValue) void update({ chatDanmakuArea: d.optionValue as ChatDanmakuArea }); }}
        >
          {CHAT_DANMAKU_AREAS.map((area) => (
            <Option key={area} value={area} text={areas[area]}>{areas[area]}</Option>
          ))}
        </Dropdown>
      </SettingRow>
      <SettingRow icon={<TopSpeed24Regular />} title={t.chatDanmakuSpeed} dim={danmakuDisabled}>
        <Dropdown
          style={{ minWidth: 150 }}
          value={speeds[settings.chatDanmakuSpeed]}
          selectedOptions={[settings.chatDanmakuSpeed]}
          onOptionSelect={(_, d) => { if (d.optionValue) void update({ chatDanmakuSpeed: d.optionValue as ChatDanmakuSpeed }); }}
        >
          {CHAT_DANMAKU_SPEEDS.map((speed) => (
            <Option key={speed} value={speed} text={speeds[speed]}>{speeds[speed]}</Option>
          ))}
        </Dropdown>
      </SettingRow>
      <SliderRow limit="chatDanmakuSizePx" icon={<ResizeLarge24Regular />} title={t.chatDanmakuSize}
        value={settings.chatDanmakuSizePx} format={(v) => `${v} px`} onChange={(v) => void update({ chatDanmakuSizePx: v })}
        dim={danmakuDisabled} />
      <SliderRow limit="chatDanmakuOpacity" icon={<DataPie24Regular />} title={t.chatDanmakuOpacity}
        value={settings.chatDanmakuOpacity} format={(v) => `${v}%`} onChange={(v) => void update({ chatDanmakuOpacity: v })}
        dim={danmakuDisabled} />
    </div>
  );

  if (chat.phase === 'idle') {
    return (
      <>
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
        {danmakuSettings}
      </>
    );
  }

  return (
    <>
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
          {chat.messages.map((message) => <ChatMessage key={message.id} message={message} members={members} onRetry={retry} />)}
        </div>
        <div className="chatComposerResize" role="separator" aria-orientation="horizontal" aria-label={t.chatResizeComposer}
          aria-valuemin={CHAT_COMPOSER_HEIGHT.min} aria-valuemax={CHAT_COMPOSER_HEIGHT.max} aria-valuenow={composerHeight}
          tabIndex={0} onPointerDown={onComposerResizePointerDown} onKeyDown={onComposerResizeKeyDown} />
        <div className="chatComposer" style={{ height: composerHeight }}>
          <Textarea className="chatComposerInput" value={draft} placeholder={t.chatPlaceholder} disabled={disabled || sending}
            resize="none" onChange={(_, d) => setDraft(d.value)} onKeyDown={onKeyDown} />
          <Button appearance="primary" icon={<Send24Regular />} disabled={disabled || sending || !draft.trim()} onClick={() => void send()}>
            {t.chatSend}
          </Button>
        </div>
        {error ? <div className="chatComposerError">{error}</div> : null}
      </div>
      {danmakuSettings}
    </>
  );
}
