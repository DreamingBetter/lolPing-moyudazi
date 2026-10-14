import type { RoomMember } from '../../shared/room';
import type { Strings } from '../../shared/i18n';
import { heartsteelFillPercent, heartsteelHealthText, heartsteelStackText, heartsteelTickStyle } from '../settings/heartsteelView';

export function HeartsteelWidgetContent({ member, text }: { member: RoomMember; text: Strings }) {
  return (
    <main className="heartsteelWidget" aria-label={text.heartsteelTitle}>
      <span className="heartsteelItem">
        <img src="../heartsteel/item.png" alt="" />
        <span>{heartsteelStackText(member.heartsteelBonusHealth)}</span>
      </span>
      <section className="heartsteelPanel">
        <div className="heartsteelTopline">
          <b>{text.heartsteelTitle}</b>
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
