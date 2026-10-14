import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RoomMember } from '../../src/shared/room';
import { strings } from '../../src/shared/i18n';
import { HeartsteelWidgetContent } from '../../src/renderer/heartsteel-widget/heartsteelWidgetContent';

const self: RoomMember = {
  peer: 'self',
  name: 'Me',
  color: 0,
  path: 'lan',
  status: 'on',
  needsUpdate: false,
  noEmotes: false,
  muted: false,
  heartsteelBonusHealth: 25,
  heartsteelMaxHealth: 2025,
  self: true,
};

describe('Heartsteel desktop widget content', () => {
  it('uses the same item badge structure as the settings page', () => {
    const html = renderToStaticMarkup(React.createElement(HeartsteelWidgetContent, {
      member: self,
      text: strings('en'),
    }));

    expect(html).toContain('class="heartsteelItem"');
    expect(html).not.toContain('class="heartsteelIcon"');
    expect(html).not.toContain('Heartsteel stacks:');
    expect(html).toContain('>25</span>');
  });
});
