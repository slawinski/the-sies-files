"use client";

// PlayerPeopleView — fast public-state scan of the circle (screen spec 21 §4).
// People are the core entities: seat, name, public status, and — where the
// projection permits — nominee / current-voter treatment. No invented
// biographies or personality tags.

import type { PublicPlayerDto, PlayerNominationDto } from "@/lib/client-api";
import PersonTile from "@/components/ui/PersonTile";
import Surface from "@/components/ui/Surface";

export default function PlayerPeopleView({
  players,
  mePlayerId,
  votingNomination,
}: {
  players: PublicPlayerDto[];
  mePlayerId: string;
  votingNomination: PlayerNominationDto | null;
}) {
  const aliveCount = players.filter((p) => p.alive).length;
  const deadCount = players.length - aliveCount;

  return (
    <div className="flex flex-col gap-3">
      <header>
        <p className="eyebrow">Gracze</p>
        <p className="mt-1 text-meta text-ink-muted">
          {aliveCount} żyje · {deadCount} nie żyje · {players.length} osób w kręgu
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {players.map((player) => {
          // The player projection identifies the nominee by name only.
          const isNominee = votingNomination?.nomineeName === player.displayName;
          const isVoting =
            votingNomination?.passStatus === "RUNNING" &&
            votingNomination.currentVirtualSeat === player.virtualSeat;
          return (
            <PersonTile
              key={player.id}
              seat={player.virtualSeat}
              name={player.displayName}
              statusLabel={
                player.alive
                  ? isVoting
                    ? "głosuje teraz"
                    : undefined
                  : "nie żyje"
              }
              statusTone={isVoting ? "brass" : player.alive ? "moss" : "neutral"}
              nominee={isNominee}
              isSelf={player.id === mePlayerId}
              trailing={isNominee ? <span className="shrink-0 text-meta text-rust">nominowany</span> : undefined}
            />
          );
        })}
      </div>

      {players.length === 0 && (
        <Surface variant="soft">
          <p className="text-sm text-ink-muted">Krąg jest jeszcze pusty.</p>
        </Surface>
      )}
    </div>
  );
}
