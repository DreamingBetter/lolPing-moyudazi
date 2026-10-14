import { HEARTSTEEL_HIT_FEEDBACK_MS, type HeartsteelCursorKind } from '../../shared/heartsteel';
import { TAG_COLORS } from '../../shared/roomColors';

export const HEARTSTEEL_BONUS_COLOR = '#49d86a';
export const HEARTSTEEL_DAMAGE_COLOR = '#ff3b3b';

export interface HeartsteelSound {
  play(key: string, volume01: number): void;
}

export interface HeartsteelTargetView {
  id: string;
  x: number;
  y: number;
  expiresAt: number;
  cursor: HeartsteelCursorKind;
}

export interface HeartsteelHitView {
  id: string;
  x: number;
  y: number;
  winnerName: string;
  winnerColor: number;
  damage: number;
  bonusGain: number;
}

export class HeartsteelStage {
  private readonly targets = new Map<string, { el: HTMLElement; timer: number }>();

  constructor(
    private readonly root: HTMLElement,
    private readonly report: (id: string, x: number, y: number) => void,
    private readonly sound: HeartsteelSound,
    private readonly volume: () => number = () => 1,
    private readonly soundGain = 1,
  ) {}

  showTarget(target: HeartsteelTargetView): void {
    this.clear(target.id);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `heartsteelTarget ${target.cursor}`;
    el.style.left = `${Math.round(target.x)}px`;
    el.style.top = `${Math.round(target.y)}px`;
    el.setAttribute('aria-label', 'Heartsteel target');
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 2 || !this.targets.has(target.id)) return;
      e.preventDefault();
      this.report(target.id, e.clientX, e.clientY);
    });
    const aura = document.createElement('span');
    aura.className = 'heartsteelAura';
    const core = document.createElement('span');
    core.className = 'heartsteelCore';
    el.append(aura, core);
    this.root.append(el);
    const timer = window.setTimeout(() => this.clear(target.id), Math.max(0, target.expiresAt - Date.now()));
    this.targets.set(target.id, { el, timer });
  }

  clear(id?: string): void {
    if (id) {
      const target = this.targets.get(id);
      if (!target) return;
      window.clearTimeout(target.timer);
      target.el.remove();
      this.targets.delete(id);
      return;
    }
    for (const [targetId, target] of this.targets) {
      window.clearTimeout(target.timer);
      target.el.remove();
      this.targets.delete(targetId);
    }
  }

  showHit(hit: HeartsteelHitView): void {
    this.clear(hit.id);
    this.sound.play('heartsteel', Math.min(1, Math.max(0, this.volume() * this.soundGain)));
    const el = document.createElement('div');
    el.className = 'heartsteelHit';
    el.style.left = `${Math.round(hit.x)}px`;
    el.style.top = `${Math.round(hit.y)}px`;
    el.style.setProperty('--tag-color', TAG_COLORS[hit.winnerColor] ?? TAG_COLORS[0]);
    el.style.setProperty('--heartsteel-damage-color', HEARTSTEEL_DAMAGE_COLOR);
    el.style.setProperty('--heartsteel-bonus-color', HEARTSTEEL_BONUS_COLOR);
    const damage = document.createElement('b');
    damage.textContent = String(hit.damage);
    const bonus = document.createElement('span');
    bonus.className = 'heartsteelBonus';
    bonus.textContent = `+${hit.bonusGain}`;
    const name = document.createElement('small');
    name.textContent = hit.winnerName;
    el.append(damage, bonus, name);
    this.root.append(el);
    window.setTimeout(() => el.remove(), HEARTSTEEL_HIT_FEEDBACK_MS);
  }
}
