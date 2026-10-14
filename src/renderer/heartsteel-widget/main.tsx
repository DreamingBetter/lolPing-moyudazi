import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveLang, strings } from '../../shared/i18n';
import type { RoomState } from '../../shared/room';
import type { Settings } from '../../shared/settings';
import { api } from '../settings/api';
import { heartsteelFillPercent, heartsteelHealthText, heartsteelStackText, heartsteelTickStyle } from '../settings/heartsteelView';
import { heartsteelWidgetMember } from './heartsteelWidgetView';
import './widget.css';

function useWidgetState(): { settings: Settings | null; room: RoomState | null } {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  useEffect(() => {
    let pushedSettings = false;
    let pushedRoom = false;
    const offSettings = api.onSettings((s) => {
      pushedSettings = true;
      setSettings(s);
    });
    const offRoom = api.onRoom((s) => {
      pushedRoom = true;
      setRoom(s);
    });
    void api.getSettings().then((s) => {
      if (!pushedSettings) setSettings(s);
    });
    void api.getRoom().then((s) => {
      if (!pushedRoom) setRoom(s);
    });
    return () => {
      offSettings();
      offRoom();
    };
  }, []);
  return { settings, room };
}

function HeartsteelWidget() {
  const { settings, room } = useWidgetState();
  const member = heartsteelWidgetMember(room);
  const text = useMemo(
    () => strings(resolveLang(settings?.language ?? 'auto', navigator.language), api.platform),
    [settings?.language],
  );
  useEffect(() => {
    document.documentElement.lang = text.lang;
  }, [text.lang]);
  if (!member) return null;
  return (
    <main className="heartsteelWidget" aria-label={text.heartsteelTitle}>
      <img className="heartsteelIcon" src="../heartsteel/item.png" alt="" />
      <section className="heartsteelPanel">
        <div className="heartsteelTopline">
          <b>{text.heartsteelTitle}</b>
          <span>{text.heartsteelStacks}: {heartsteelStackText(member.heartsteelBonusHealth)}</span>
        </div>
        <div className="heartsteelBar" style={heartsteelTickStyle(member.heartsteelMaxHealth)}
          aria-label={`${text.heartsteelHealth} ${heartsteelHealthText(member.heartsteelMaxHealth)}`}>
          <span className="heartsteelBarFill" style={{ width: `${heartsteelFillPercent(member.heartsteelMaxHealth)}%` }} />
          <span className="heartsteelBarTicks" />
          <span className="heartsteelBarText">{heartsteelHealthText(member.heartsteelMaxHealth)}</span>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<HeartsteelWidget />);
