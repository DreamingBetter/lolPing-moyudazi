import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, overlaySettings } from '../../src/shared/settings';
import { ChatDanmakuStage } from '../../src/renderer/overlay/chatDanmaku';

class FakeElement {
  className = '';
  textContent = '';
  innerHTML = '';
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  width = 160;
  readonly style = {
    values: new Map<string, string>(),
    setProperty: (k: string, v: string) => this.style.values.set(k, v),
  };
  private readonly listeners = new Map<string, Array<{ fn: () => void; once: boolean }>>();

  constructor(readonly tagName: string) {}

  append(...els: FakeElement[]): void {
    for (const el of els) {
      el.remove();
      el.parent = this;
      this.children.push(el);
    }
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  getBoundingClientRect(): { width: number; height: number } {
    return { width: this.width, height: 24 };
  }

  addEventListener(type: string, fn: () => void, opts?: { once?: boolean }): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { fn, once: opts?.once === true }]);
  }

  dispatch(type: string): void {
    const all = this.listeners.get(type) ?? [];
    this.listeners.set(type, all.filter((l) => !l.once));
    for (const l of all) l.fn();
  }

  find(cls: string): FakeElement[] {
    return this.children.flatMap((c) => [...(c.className.split(' ').includes(cls) ? [c] : []), ...c.find(cls)]);
  }
}

const makeStage = () => {
  const layer = new FakeElement('div');
  const stage = new ChatDanmakuStage(layer as unknown as HTMLElement, () => ({ width: 800, height: 400 }));
  stage.applySettings(overlaySettings(DEFAULT_SETTINGS));
  return { layer, stage };
};

beforeEach(() => {
  vi.stubGlobal('document', { createElement: (tag: string) => new FakeElement(tag) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatDanmakuStage', () => {
  it('does not spawn items while disabled', () => {
    const { layer, stage } = makeStage();
    stage.applySettings({ ...overlaySettings(DEFAULT_SETTINGS), chatDanmakuEnabled: false });
    stage.spawn({ id: '1', name: 'Alex', color: 2, text: 'hidden' });
    expect(layer.find('chatDanmakuItem')).toHaveLength(0);
    expect(stage.debugCounts()).toEqual({ active: 0, pending: 0 });
  });

  it('inserts chat text as text content, not markup', () => {
    const { layer, stage } = makeStage();
    stage.spawn({ id: '1', name: 'Alex', color: 2, text: '<img src=x onerror=alert(1)>' });
    const [item] = layer.find('chatDanmakuItem');
    expect(item.innerHTML).toBe('');
    expect(item.find('chatDanmakuName')[0].textContent).toBe('Alex:');
    expect(item.find('chatDanmakuText')[0].textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('applies opacity once on the danmaku layer', () => {
    const { layer, stage } = makeStage();
    stage.applySettings({ ...overlaySettings(DEFAULT_SETTINGS), chatDanmakuOpacity: 40 });
    stage.spawn({ id: '1', name: 'Alex', color: 2, text: 'visible' });
    const [item] = layer.find('chatDanmakuItem');
    expect(layer.style.values.get('--chat-danmaku-opacity')).toBe('0.4');
    expect(item.style.values.has('--danmaku-opacity')).toBe(false);
  });

  it('caps active and pending visual work', () => {
    const { stage } = makeStage();
    for (let i = 0; i < 80; i++) stage.spawn({ id: `${i}`, name: 'A', color: 1, text: `m${i}` });
    expect(stage.debugCounts().active).toBeLessThanOrEqual(24);
    expect(stage.debugCounts().pending).toBeLessThanOrEqual(24);
  });

  it('removes an item after its animation ends', () => {
    const { layer, stage } = makeStage();
    stage.spawn({ id: '1', name: 'Alex', color: 2, text: 'bye' });
    const [item] = layer.find('chatDanmakuItem');
    item.dispatch('animationend');
    expect(layer.find('chatDanmakuItem')).toHaveLength(0);
    expect(stage.debugCounts()).toEqual({ active: 0, pending: 0 });
  });

  it('clears active and pending items when disabled', () => {
    const { layer, stage } = makeStage();
    for (let i = 0; i < 80; i++) stage.spawn({ id: `${i}`, name: 'A', color: 1, text: `m${i}` });
    expect(stage.debugCounts().active + stage.debugCounts().pending).toBeGreaterThan(0);
    stage.applySettings({ ...overlaySettings(DEFAULT_SETTINGS), chatDanmakuEnabled: false });
    expect(layer.find('chatDanmakuItem')).toHaveLength(0);
    expect(stage.debugCounts()).toEqual({ active: 0, pending: 0 });
  });
});
