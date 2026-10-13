import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wheel } from '../../src/renderer/overlay/wheel';

class FakeClassList {
  private readonly values = new Set<string>();
  constructor(initial = '') {
    for (const cls of initial.split(/\s+/).filter(Boolean)) this.values.add(cls);
  }
  add(cls: string): void { this.values.add(cls); }
  remove(cls: string): void { this.values.delete(cls); }
  contains(cls: string): boolean { return this.values.has(cls); }
  replaceWith(raw: string): void {
    this.values.clear();
    for (const cls of raw.split(/\s+/).filter(Boolean)) this.values.add(cls);
  }
  toString(): string { return [...this.values].join(' '); }
}

class FakeSvgElement {
  children: FakeSvgElement[] = [];
  textContent = '';
  innerHTML = '';
  readonly style: Record<string, string> = {};
  readonly attrs = new Map<string, string>();
  readonly classList = new FakeClassList();

  constructor(readonly tagName: string, readonly id = '') {}

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === 'class') this.classList.replaceWith(value);
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  append(...els: FakeSvgElement[]): void {
    this.children.push(...els);
  }

  findByClass(cls: string): FakeSvgElement[] {
    return this.children.flatMap((child) => [
      ...(child.classList.contains(cls) ? [child] : []),
      ...child.findByClass(cls),
    ]);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', {
    createElementNS: (_ns: string, tag: string) => new FakeSvgElement(tag),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Wheel', () => {
  it('shows an item hint after hovering the same slice for 1.5 seconds', () => {
    const svg = new FakeSvgElement('svg', 'actionWheel') as unknown as SVGSVGElement;
    const wheel = new Wheel(svg, 'ACTION', '../actions/app.svg', () => undefined);
    wheel.setItems([{ key: 'volume', icon: '../actions/volume-up.svg', label: '音量+6', description: '按配置的音量步进提高系统音量' }]);

    wheel.open(100, 100);
    wheel.move(100, -50);
    expect((svg as unknown as FakeSvgElement).findByClass('hint').at(0)?.classList.contains('show')).toBe(false);

    vi.advanceTimersByTime(1499);
    expect((svg as unknown as FakeSvgElement).findByClass('hint').at(0)?.classList.contains('show')).toBe(false);

    vi.advanceTimersByTime(1);
    const root = svg as unknown as FakeSvgElement;
    expect(root.findByClass('hint').at(0)?.classList.contains('show')).toBe(true);
    expect(root.findByClass('hintLabel').at(0)?.textContent).toBe('音量+6');
    expect(root.findByClass('hintDesc').at(0)?.textContent).toBe('按配置的音量步进提高系统音量');

    wheel.move(100, 100);
    expect(root.findByClass('hint').at(0)?.classList.contains('show')).toBe(false);
  });
});
