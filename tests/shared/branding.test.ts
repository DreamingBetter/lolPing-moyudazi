import { describe, expect, it } from 'vitest';
import {
  APP_DISPLAY_NAME,
  APP_DATA_DIR_NAME,
  GITHUB_OWNER,
  GITHUB_REPO,
  LATEST_RELEASE_URL,
  PACKAGE_NAME,
  PROJECT_URL,
  releaseTagUrl,
} from '../../src/shared/branding';

describe('branding', () => {
  it('identifies the Moyudazi Windows fork and its GitHub update source', () => {
    expect(APP_DISPLAY_NAME).toBe('lolPing-摸鱼搭子');
    expect(PACKAGE_NAME).toBe('lolping-moyudazi-windows');
    expect(APP_DATA_DIR_NAME).toBe('lolPing-moyudazi');
    expect(GITHUB_OWNER).toBe('DreamingBetter');
    expect(GITHUB_REPO).toBe('lolPing-moyudazi-Windows');
    expect(PROJECT_URL).toBe('https://github.com/DreamingBetter/lolPing-moyudazi-Windows');
    expect(LATEST_RELEASE_URL).toBe('https://github.com/DreamingBetter/lolPing-moyudazi-Windows/releases/latest');
    expect(releaseTagUrl('0.5.1')).toBe('https://github.com/DreamingBetter/lolPing-moyudazi-Windows/releases/tag/v0.5.1');
  });
});
