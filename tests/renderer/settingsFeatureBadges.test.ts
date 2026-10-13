import { describe, expect, it } from 'vitest';
import { NEW_FEATURE_SECTION_IDS, sectionHasNewFeature } from '../../src/renderer/settings/featureBadges';

describe('settings feature badges', () => {
  it('marks every tab that contains a new feature', () => {
    expect(NEW_FEATURE_SECTION_IDS).toEqual(['actions', 'chat', 'app']);
    expect(sectionHasNewFeature('actions')).toBe(true);
    expect(sectionHasNewFeature('chat')).toBe(true);
    expect(sectionHasNewFeature('app')).toBe(true);
    expect(sectionHasNewFeature('room')).toBe(false);
  });
});
