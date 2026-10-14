import { describe, expect, it } from 'vitest';
import { cursorSkinPatchForScheme, cursorSkinSchemeFromSettings } from '../../src/renderer/settings/cursorSkinScheme';

describe('cursor skin scheme settings mapping', () => {
  it('maps saved cursor settings to the selected radio scheme', () => {
    expect(cursorSkinSchemeFromSettings({ cursorSkinEnabled: false, cursorSkinClassic: false })).toBe('system');
    expect(cursorSkinSchemeFromSettings({ cursorSkinEnabled: false, cursorSkinClassic: true })).toBe('system');
    expect(cursorSkinSchemeFromSettings({ cursorSkinEnabled: true, cursorSkinClassic: false })).toBe('modern');
    expect(cursorSkinSchemeFromSettings({ cursorSkinEnabled: true, cursorSkinClassic: true })).toBe('classic');
  });

  it('maps each radio scheme to the minimal settings patch needed to apply it', () => {
    expect(cursorSkinPatchForScheme('system')).toEqual({ cursorSkinEnabled: false });
    expect(cursorSkinPatchForScheme('modern')).toEqual({ cursorSkinEnabled: true, cursorSkinClassic: false });
    expect(cursorSkinPatchForScheme('classic')).toEqual({ cursorSkinEnabled: true, cursorSkinClassic: true });
  });
});
