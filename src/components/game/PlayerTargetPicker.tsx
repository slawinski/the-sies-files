"use client";

// PlayerTargetPicker — people-first target selection for operational actions
// (spec 19 §6.4). One column at <=359px, two columns from 360px when labels
// stay readable. Never derives private state not present in the projection.

import type { PublicPlayerDto } from "@/lib/client-api";
import PersonTile from "@/components/ui/PersonTile";

export default function PlayerTargetPicker({
  players,
  selectedIds,
  mePlayerId,
  onToggle,
}: {
  players: PublicPlayerDto[];
  selectedIds: string[];
  mePlayerId: string;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
      {players.map((player) => (
        <PersonTile
          key={player.id}
          seat={player.virtualSeat}
          name={player.displayName}
          statusLabel={player.alive ? undefined : "nie żyje"}
          statusTone="neutral"
          selected={selectedIds.includes(player.id)}
          isSelf={player.id === mePlayerId}
          onClick={() => onToggle(player.id)}
        />
      ))}
    </div>
  );
}
