"use client";

// VoteStage — the formal-mode vote surface (audit 18 UX-04 / spec 19 §6.8).
// Rust accent, nominee front and center, explicit TAK/NIE, ghost-vote copy,
// server-confirmed locked state. Never implies a vote is counted before the
// server acknowledges it.

import type { PlayerNominationDto } from "@/lib/client-api";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";

export default function VoteStage({
  nomination,
  isMyTurn,
  meAlive,
  ghostVoteAvailable,
  busy,
  connectionBlocked,
  onVote,
}: {
  nomination: PlayerNominationDto;
  isMyTurn: boolean;
  meAlive: boolean;
  ghostVoteAvailable: boolean;
  busy: boolean;
  connectionBlocked: boolean;
  onVote: (intent: boolean) => void;
}) {
  const myVote = nomination.myVoteIntent;
  const isRunning = nomination.passStatus === "RUNNING";
  const eligible = isMyTurn && (meAlive || ghostVoteAvailable);

  return (
    <Surface variant="formal">
      <p className="eyebrow text-rust">Głosowanie · tryb formalny</p>
      <h2 className="display mt-2 text-2xl leading-tight text-ink-primary">
        {nomination.nomineeName ?? "—"}
      </h2>
      {nomination.nominatorName && (
        <p className="mt-1 text-sm text-ink-secondary">
          nominowany przez {nomination.nominatorName}
        </p>
      )}

      <div className="mt-5">
        <p className="eyebrow mb-2">Twój głos</p>
        {!isRunning ? (
          <p className="text-sm text-ink-secondary">
            {nomination.passStatus === "READY"
              ? "Głosowanie czeka na rozpoczęcie przez Mistrza Gry."
              : "Głosowanie zakończone — czekaj na zamknięcie."}
          </p>
        ) : !eligible ? (
          <p className="text-sm text-ink-secondary">
            {!meAlive
              ? "Jesteś martwy i zużyłeś już swój głos ducha."
              : "Czekaj na swoją kolej — nie jesteś teraz przy głosie."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={myVote === true ? "formal" : "quiet"}
                size="lg"
                aria-pressed={myVote === true}
                busy={busy && myVote !== true}
                disabled={connectionBlocked}
                onClick={() => onVote(true)}
              >
                TAK
              </Button>
              <Button
                variant={myVote === false ? "formal" : "quiet"}
                size="lg"
                aria-pressed={myVote === false}
                busy={busy && myVote !== false}
                disabled={connectionBlocked}
                onClick={() => onVote(false)}
              >
                NIE
              </Button>
            </div>

            {!meAlive && ghostVoteAvailable && (
              <Notice variant="warning" className="mt-3">
                Masz jeden głos ducha. Użycie go jest trwałe.
              </Notice>
            )}

            {myVote !== null && (
              <Notice variant="success" className="mt-3">
                Twój głos został zapisany:{" "}
                <span className="font-semibold">{myVote ? "TAK" : "NIE"}</span>
              </Notice>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Badge variant="rust">{nomination.status === "VOTING" ? "głosowanie" : nomination.status}</Badge>
        {nomination.myVoteIntent !== null && <Badge variant="success">głos oddany</Badge>}
      </div>
    </Surface>
  );
}
