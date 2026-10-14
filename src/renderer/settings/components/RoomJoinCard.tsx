import { Button, Input } from '@fluentui/react-components';
import { PeopleCommunity24Regular } from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useText } from '../text';

export function RoomJoinCard() {
  const t = useText();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  useEffect(() => {
    void api.clipboardRoomCode().then((c) => {
      if (c && !touched.current) setCode(c);
    });
  }, []);
  const join = async () => {
    if (busy) return;
    setBusy(true);
    const r = await api.joinRoom(code);
    setBusy(false);
    setError(r.ok ? null : r.error === 'mistyped' ? t.roomMistyped : r.error === 'failed' ? t.roomJoinFailed : t.roomInvalid);
  };
  return (
    <div className="card roomJoin">
      <span className="icon"><PeopleCommunity24Regular /></span>
      <div className="lbl">
        {t.roomJoinTitle}
        <span className="desc">{t.roomJoinDesc}</span>
        <span className="desc">{t.roomNetworkHint}</span>
      </div>
      <div className="ctl">
        <Input placeholder="PING-XXXXX-XXXXX" value={code} style={{ width: 190 }}
          onChange={(_, d) => {
            touched.current = true;
            setCode(d.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void join()} />
        <Button appearance="primary" disabled={busy || !code.trim()} onClick={() => void join()}>{t.roomJoin}</Button>
        <Button disabled={busy} onClick={() => {
          setBusy(true);
          void api.createRoom().finally(() => setBusy(false));
        }}>{t.roomCreate}</Button>
      </div>
      {error ? <div className="roomError">{error}</div> : null}
    </div>
  );
}
