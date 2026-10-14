import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartsteelStage } from '../../src/renderer/overlay/heartsteelStage';

class FakeStyle {
  readonly values = new Map<string, string>();
  left = '';
  top = '';
  setProperty(k: string, v: string): void {
    this.values.set(k, v);
  }
}

class FakeElement {
  type = '';
  className = '';
  parent: FakeElement | null = null;
  readonly children: FakeElement[] = [];
  readonly style = new FakeStyle();
  private attrs = new Map<string, string>();
  private listeners = new Map<string, Array<(e: Event) => void>>();
  private text = '';
  private html = '';

  constructor(readonly tagName: string) {}

  get textContent(): string {
    return `${this.text}${this.html.replace(/<[^>]*>/g, '')}${this.children.map((c) => c.textContent).join('')}`;
  }

  set textContent(v: string) {
    this.text = v;
    this.html = '';
  }

  set innerHTML(v: string) {
    this.html = v;
  }

  get innerHTML(): string {
    return this.html;
  }

  append(...els: FakeElement[]): void {
    for (const el of els) {
      el.remove();
      el.parent = this;
      this.children.push(el);
    }
  }

  remove(): void {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }

  addEventListener(type: string, fn: (e: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  dispatchEvent(e: Event): boolean {
    for (const fn of this.listeners.get(e.type) ?? []) fn(e);
    return true;
  }

  querySelector(selector: string): FakeElement | null {
    const cls = selector.startsWith('.') ? selector.slice(1) : selector;
    const stack = [...this.children];
    while (stack.length > 0) {
      const el = stack.shift()!;
      if (el.className.split(/\s+/).includes(cls)) return el;
      stack.push(...el.children);
    }
    return null;
  }
}

describe('HeartsteelStage', () => {
  let root: FakeElement;
  let reports: Array<{ id: string; x: number; y: number }>;

  beforeEach(() => {
    vi.useFakeTimers();
    root = new FakeElement('div');
    vi.stubGlobal('document', {
      createElement: (tag: string) => new FakeElement(tag),
    });
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    });
    reports = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports right-click hits and ignores left clicks', () => {
    const stage = new HeartsteelStage(root as unknown as HTMLElement, (id, x, y) => reports.push({ id, x, y }), { play: vi.fn() });
    stage.showTarget({ id: 'a'.repeat(32), x: 30, y: 40, expiresAt: Date.now() + 1000, cursor: 'modern' });
    const target = root.querySelector('.heartsteelTarget')!;
    target.dispatchEvent({ type: 'mousedown', button: 0, clientX: 30, clientY: 40, preventDefault: vi.fn() } as unknown as Event);
    target.dispatchEvent({ type: 'contextmenu', button: 2, clientX: 30, clientY: 40, preventDefault: vi.fn() } as unknown as Event);
    target.dispatchEvent({ type: 'mousedown', button: 2, clientX: 31, clientY: 41, preventDefault: vi.fn() } as unknown as Event);
    expect(reports).toEqual([{ id: 'a'.repeat(32), x: 31, y: 41 }]);
  });

  it('shows hit feedback and plays the Heartsteel sound', () => {
    const sound = { play: vi.fn() };
    const stage = new HeartsteelStage(root as unknown as HTMLElement, vi.fn(), sound, () => 0.5, 1.6);
    stage.showHit({ id: 'b'.repeat(32), x: 80, y: 90, winnerName: 'Alex', winnerColor: 2, damage: 185, bonusGain: 19 });
    expect(root.textContent).toContain('185');
    expect(root.textContent).toContain('+19');
    expect(root.textContent).toContain('Alex');
    expect(sound.play).toHaveBeenCalledWith('heartsteel', 0.8);
    expect(root.querySelector('.heartsteelHit')!.style.values.get('--heartsteel-bonus-color')).toBe('#49d86a');
  });

  it('caps the boosted Heartsteel sound at full shared volume', () => {
    const sound = { play: vi.fn() };
    const stage = new HeartsteelStage(root as unknown as HTMLElement, vi.fn(), sound, () => 0.9, 1.6);
    stage.showHit({ id: 'c'.repeat(32), x: 80, y: 90, winnerName: 'Alex', winnerColor: 2, damage: 185, bonusGain: 19 });
    expect(sound.play).toHaveBeenCalledWith('heartsteel', 1);
  });
});
