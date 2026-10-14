import { describe, expect, it } from 'vitest';
import {
  heartsteelFillPercent,
  heartsteelHealthText,
  heartsteelStackText,
  heartsteelTickStyle,
} from '../../src/renderer/settings/heartsteelView';

describe('heartsteel room view helpers', () => {
  it('formats max health and stack text', () => {
    expect(heartsteelHealthText(1000)).toBe('2000');
    expect(heartsteelHealthText(12345)).toBe('12345');
    expect(heartsteelStackText(0)).toBe('0');
    expect(heartsteelStackText(9876)).toBe('9876');
  });

  it('renders current health as a full bar', () => {
    expect(heartsteelFillPercent(1000)).toBe(100);
    expect(heartsteelFillPercent(2000)).toBe(100);
    expect(heartsteelFillPercent(50000)).toBe(100);
  });

  it('derives League-like tick density from max health', () => {
    expect(heartsteelTickStyle(2000)).toEqual({
      '--heartsteel-small-tick': '5%',
      '--heartsteel-large-tick': '50%',
    });
    expect(heartsteelTickStyle(4000)).toEqual({
      '--heartsteel-small-tick': '2.5%',
      '--heartsteel-large-tick': '25%',
    });
  });
});
