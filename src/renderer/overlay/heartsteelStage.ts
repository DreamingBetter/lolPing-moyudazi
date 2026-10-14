import type { HeartsteelCursorKind } from '../../shared/heartsteel';
import { TAG_COLORS } from '../../shared/roomColors';

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
  private target: HTMLElement | null = null;
  private targetId: string | null = null;
  private expireTimer: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly report: (id: string, x: number, y: number) => void,
    private readonly sound: HeartsteelSound,
    private readonly volume: () => number = () => 1,
  ) {}

  showTarget(target: HeartsteelTargetView): void {
    this.clear();
    this.targetId = target.id;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `heartsteelTarget ${target.cursor}`;
    el.style.left = `${Math.round(target.x)}px`;
    el.style.top = `${Math.round(target.y)}px`;
    el.setAttribute('aria-label', 'Heartsteel target');
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 2 || this.targetId !== target.id) return;
      e.preventDefault();
      this.report(target.id, e.clientX, e.clientY);
    });
    const aura = document.createElement('span');
    aura.className = 'heartsteelAura';
    const core = document.createElement('span');
    core.className = 'heartsteelCore';
    el.append(aura, core);
    this.root.append(el);
    this.target = el;
    this.expireTimer = window.setTimeout(() => this.clear(target.id), Math.max(0, target.expiresAt - Date.now()));
  }

  clear(id?: string): void {
    if (id && this.targetId && id !== this.targetId) return;
    if (this.expireTimer !== null) window.clearTimeout(this.expireTimer);
    this.expireTimer = null;
    this.target?.remove();
    this.target = null;
    this.targetId = null;
  }

  showHit(hit: HeartsteelHitView): void {
    this.clear(hit.id);
    this.sound.play('heartsteel', this.volume());
    const el = document.createElement('div');
    el.className = 'heartsteelHit';
    el.style.left = `${Math.round(hit.x)}px`;
    el.style.top = `${Math.round(hit.y)}px`;
    el.style.setProperty('--tag-color', TAG_COLORS[hit.winnerColor] ?? TAG_COLORS[0]);
    const damage = document.createElement('b');
    damage.textContent = String(hit.damage);
    const bonus = document.createElement('span');
    bonus.textContent = `+${hit.bonusGain}`;
    const name = document.createElement('small');
    name.textContent = hit.winnerName;
    el.append(damage, bonus, name);
    this.root.append(el);
    window.setTimeout(() => el.remove(), 1600);
  }
}
