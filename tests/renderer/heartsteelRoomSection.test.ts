import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RoomMember, RoomState } from '../../src/shared/room';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { strings } from '../../src/shared/i18n';
import { RoomSection } from '../../src/renderer/settings/components/RoomSection';
import { TextContext } from '../../src/renderer/settings/text';

const mocked = vi.hoisted(() => ({
  room: null as RoomState | null,
}));

vi.mock('../../src/renderer/settings/useRoomState', () => ({
  useRoomState: () => mocked.room,
}));

vi.mock('../../src/renderer/settings/api', () => ({
  api: {
    copyRoomCode: vi.fn(),
    leaveRoom: vi.fn(),
    muteMember: vi.fn(),
    platform: 'win',
    retryInternet: vi.fn(),
    setHeartsteelEnabled: vi.fn(),
  },
}));

const member = (partial: Partial<RoomMember> & Pick<RoomMember, 'peer' | 'name' | 'self'>): RoomMember => ({
  color: 0,
  heartsteelBonusHealth: 0,
  heartsteelMaxHealth: 2000,
  muted: false,
  needsUpdate: false,
  noEmotes: false,
  path: 'lan',
  status: 'on',
  ...partial,
});

function activeRoom(): RoomState {
  return {
    phase: 'active',
    code: 'PING-12345-6789A',
    displays: [],
    heartsteel: { enabled: true, target: null, lastHit: null },
    lan: 'ok',
    internet: 'off',
    lonely: false,
    clockSkew: false,
    members: [
      member({ peer: 'self', name: 'Me', self: true, heartsteelBonusHealth: 25, heartsteelMaxHealth: 2025 }),
      member({ peer: 'other', name: 'Other', self: false, heartsteelBonusHealth: 50, heartsteelMaxHealth: 2050 }),
    ],
  };
}

function renderRoomSection(room: RoomState): string {
  mocked.room = room;
  return renderToStaticMarkup(React.createElement(
    TextContext.Provider,
    { value: strings('en') },
    React.createElement(RoomSection, {
      settings: DEFAULT_SETTINGS,
      update: vi.fn(),
      onOpenChat: vi.fn(),
    }),
  ));
}

const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe('Heartsteel room section layout', () => {
  it('shows the local Heartsteel stats once in a dedicated row, not beside every member', () => {
    const html = renderRoomSection(activeRoom());
    const membersStart = html.indexOf('class="card members"');

    expect(count(html, 'class="heartsteelMember"')).toBe(1);
    expect(html).toContain('class="heartsteelSummary"');
    expect(html.slice(membersStart)).not.toContain('heartsteelMember');
  });
});
