import type { RoomMember, RoomState } from '../../shared/room';

export function heartsteelWidgetMember(room: RoomState | null): RoomMember | null {
  if (!room) return null;
  return room.members.find((m) => m.self) ?? room.members[0] ?? null;
}
