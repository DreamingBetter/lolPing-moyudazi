import type { Settings } from '../../shared/settings';

export type CursorSkinScheme = 'system' | 'modern' | 'classic';

export function cursorSkinSchemeFromSettings(settings: Pick<Settings, 'cursorSkinEnabled' | 'cursorSkinClassic'>): CursorSkinScheme {
  if (!settings.cursorSkinEnabled) return 'system';
  return settings.cursorSkinClassic ? 'classic' : 'modern';
}

export function cursorSkinPatchForScheme(scheme: CursorSkinScheme): Partial<Settings> {
  switch (scheme) {
    case 'modern':
      return { cursorSkinEnabled: true, cursorSkinClassic: false };
    case 'classic':
      return { cursorSkinEnabled: true, cursorSkinClassic: true };
    case 'system':
      return { cursorSkinEnabled: false };
  }
}
