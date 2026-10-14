import { describe, expect, it } from 'vitest';
import type { RoomState } from '../../src/shared/room';
import { heartsteelWidgetMember } from '../../src/renderer/heartsteel-widget/heartsteelWidgetView';

const state = (members: RoomState['members']): RoomState => ({
  phase: 'idle',
  code: null,
  members,
  heartsteel: { enabled: false, target: null, lastHit: null },
  lan: 'off',
  internet: 'off',
  lonely: false,
  clockSkew: false,
  displays: [],
});

describe('heartsteelWidgetMember', () => {
  it('shows this machine first and otherwise falls back to the first member', () => {
    const other = {
      peer: 'other',
      name: 'Other',
      color: 2,
      path: 'lan',
      status: 'on',
      needsUpdate: false,
      noEmotes: false,
      muted: false,
      heartsteelBonusHealth: 10,
      heartsteelMaxHealth: 2010,
      self: false,
    } as const;
    const self = { ...other, peer: 'self', name: 'Me', self: true, heartsteelBonusHealth: 25, heartsteelMaxHealth: 2025 } as const;
    expect(heartsteelWidgetMember(null)).toBeNull();
    expect(heartsteelWidgetMember(state([]))).toBeNull();
    expect(heartsteelWidgetMember(state([other]))).toEqual(other);
    expect(heartsteelWidgetMember(state([other, self]))).toEqual(self);
  });
});
