import { describe, expect, it } from 'vitest';
import { heartsteelFillPercent, heartsteelHealthText, heartsteelStackText } from '../../src/renderer/settings/heartsteelView';

describe('heartsteel room view helpers', () => {
  it('formats max health and stack text', () => {
    expect(heartsteelHealthText(1000)).toBe('1000');
    expect(heartsteelHealthText(12345)).toBe('12345');
    expect(heartsteelStackText(0)).toBe('0');
    expect(heartsteelStackText(9876)).toBe('9876');
  });

  it('keeps the health fill visible while capping huge growth', () => {
    expect(heartsteelFillPercent(1000)).toBe(52);
    expect(heartsteelFillPercent(2000)).toBeGreaterThan(52);
    expect(heartsteelFillPercent(50000)).toBe(100);
  });
});
