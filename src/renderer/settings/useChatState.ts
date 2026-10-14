import { useEffect, useState } from 'react';
import type { RoomChatState } from '../../shared/roomChat';
import { api } from './api';

export function useChatState(): RoomChatState | null {
  const [chat, setChat] = useState<RoomChatState | null>(null);
  useEffect(() => {
    let pushed = false;
    const off = api.onChat((state) => {
      pushed = true;
      setChat(state);
    });
    void api.getChat().then((state) => {
      if (!pushed) setChat(state);
    });
    return off;
  }, []);
  return chat;
}
