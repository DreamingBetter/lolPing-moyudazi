import type { OverlayEvents } from '../../shared/ipc';
import { TAG_COLORS } from '../../shared/roomColors';
import type { ChatDanmakuArea, ChatDanmakuSpeed, OverlaySettings } from '../../shared/settings';

type ChatDanmakuMessage = OverlayEvents['chat:spawn'];
type Viewport = { width: number; height: number };

const MAX_ACTIVE = 24;
const MAX_PENDING = 24;
const AREA_RATIO: Record<ChatDanmakuArea, number> = { quarter: 0.25, half: 0.5, threeQuarter: 0.75, full: 1 };
const SPEED_PX_PER_SECOND: Record<ChatDanmakuSpeed, number> = { slow: 110, normal: 165, fast: 240 };

interface ActiveItem {
  el: HTMLElement;
  track: number;
}

export class ChatDanmakuStage {
  private settings: OverlaySettings | null = null;
  private readonly active: ActiveItem[] = [];
  private readonly pending: ChatDanmakuMessage[] = [];
  private nextTrack = 0;
  private trackAvailableAt: number[] = [];
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly layer: HTMLElement,
    private readonly viewport: () => Viewport = () => ({ width: window.innerWidth, height: window.innerHeight }),
  ) {
    this.layer.className = `${this.layer.className} chatDanmakuLayer`.trim();
    this.layer.setAttribute?.('aria-hidden', 'true');
  }

  applySettings(settings: OverlaySettings): void {
    this.settings = settings;
    this.applyLayerStyle();
    if (!settings.chatDanmakuEnabled) this.clear();
  }

  spawn(message: ChatDanmakuMessage): void {
    if (!this.settings?.chatDanmakuEnabled) return;
    if (this.active.length >= MAX_ACTIVE) return this.enqueue(message);
    const el = this.createItem(message);
    this.layer.append(el);
    const width = Math.max(1, el.getBoundingClientRect().width);
    const track = this.pickTrack(width);
    if (track === null) {
      el.remove();
      this.enqueue(message);
      return;
    }
    this.startItem(el, track, width);
  }

  clear(): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = null;
    for (const item of this.active) item.el.remove();
    this.active.length = 0;
    this.pending.length = 0;
    this.trackAvailableAt = [];
    this.nextTrack = 0;
  }

  debugCounts(): { active: number; pending: number } {
    return { active: this.active.length, pending: this.pending.length };
  }

  private applyLayerStyle(): void {
    if (!this.settings) return;
    const { height } = this.viewport();
    const areaHeight = Math.max(this.settings.chatDanmakuSizePx * 2, height * AREA_RATIO[this.settings.chatDanmakuArea]);
    this.layer.style.setProperty('--chat-danmaku-area-height', `${Math.round(areaHeight)}px`);
    this.layer.style.setProperty('--chat-danmaku-opacity', `${this.settings.chatDanmakuOpacity / 100}`);
  }

  private createItem(message: ChatDanmakuMessage): HTMLElement {
    const item = document.createElement('div');
    item.className = 'chatDanmakuItem';
    item.style.setProperty('--danmaku-size', `${this.settings?.chatDanmakuSizePx ?? 24}px`);
    item.style.setProperty('--tag-color', TAG_COLORS[message.color] ?? TAG_COLORS[0]);

    const name = document.createElement('span');
    name.className = 'chatDanmakuName';
    name.textContent = `${message.name}:`;

    const text = document.createElement('span');
    text.className = 'chatDanmakuText';
    text.textContent = message.text;

    item.append(name, text);
    return item;
  }

  private pickTrack(width: number): number | null {
    const settings = this.settings;
    if (!settings) return null;
    const now = Date.now();
    const count = this.trackCount();
    while (this.trackAvailableAt.length < count) this.trackAvailableAt.push(0);
    for (let i = 0; i < count; i++) {
      const track = (this.nextTrack + i) % count;
      if ((this.trackAvailableAt[track] ?? 0) > now) continue;
      this.nextTrack = (track + 1) % count;
      this.trackAvailableAt[track] = now + Math.ceil((width / SPEED_PX_PER_SECOND[settings.chatDanmakuSpeed]) * 1000) + 240;
      return track;
    }
    return null;
  }

  private trackCount(): number {
    const settings = this.settings;
    if (!settings) return 1;
    const { height } = this.viewport();
    const areaHeight = Math.max(settings.chatDanmakuSizePx * 2, height * AREA_RATIO[settings.chatDanmakuArea]);
    const trackHeight = Math.max(settings.chatDanmakuSizePx + 10, Math.ceil(settings.chatDanmakuSizePx * 1.45));
    return Math.max(1, Math.min(MAX_ACTIVE, Math.floor(areaHeight / trackHeight)));
  }

  private startItem(el: HTMLElement, track: number, width: number): void {
    const settings = this.settings;
    if (!settings) {
      el.remove();
      return;
    }
    const { width: viewportWidth } = this.viewport();
    const speed = SPEED_PX_PER_SECOND[settings.chatDanmakuSpeed];
    const duration = Math.max(4, Math.min(18, (viewportWidth + width) / speed));
    const y = Math.round(track * Math.max(settings.chatDanmakuSizePx + 10, settings.chatDanmakuSizePx * 1.45) + 6);
    el.style.setProperty('--from-x', `${viewportWidth}px`);
    el.style.setProperty('--to-x', `${-Math.ceil(width)}px`);
    el.style.setProperty('--track-y', `${y}px`);
    el.style.setProperty('--danmaku-duration', `${duration.toFixed(2)}s`);
    this.active.push({ el, track });
    el.addEventListener('animationend', () => this.finishItem(el), { once: true });
  }

  private finishItem(el: HTMLElement): void {
    const index = this.active.findIndex((item) => item.el === el);
    if (index >= 0) this.active.splice(index, 1);
    el.remove();
    this.drainPending();
  }

  private enqueue(message: ChatDanmakuMessage): void {
    this.pending.push(message);
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    this.scheduleDrain();
  }

  private drainPending(): void {
    if (this.drainTimer) clearTimeout(this.drainTimer);
    this.drainTimer = null;
    if (!this.settings?.chatDanmakuEnabled) return this.clear();
    let moved = true;
    while (moved && this.pending.length > 0 && this.active.length < MAX_ACTIVE) {
      const before = this.pending.length;
      const next = this.pending.shift()!;
      this.spawn(next);
      moved = this.pending.length < before;
    }
    if (this.pending.length > 0) this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.drainTimer || !this.settings?.chatDanmakuEnabled) return;
    const now = Date.now();
    const next = this.trackAvailableAt.filter((t) => t > now).sort((a, b) => a - b)[0] ?? now + 200;
    this.drainTimer = setTimeout(() => this.drainPending(), Math.max(20, Math.min(1000, next - now)));
  }
}
