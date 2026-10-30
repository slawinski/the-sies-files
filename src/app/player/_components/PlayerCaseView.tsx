"use client";

// PlayerCaseView — the Akta destination (spec 19 §6.2). Exactly one primary
// stage above the fold; secondary case content only during free investigation.

import { useState } from "react";
import type { PlayerGameProjection, PlayerNominationDto } from "@/lib/client-api";
import type { PlayerView } from "@/lib/presentation/types";
import {
  requiredTargetCount,
  selectActiveVotingNomination,
  selectPlayerPresentation,
} from "@/lib/presentation/player-mode";
import CurrentActionStage from "@/components/game/CurrentActionStage";
import GameEndedStage from "@/components/game/GameEndedStage";
import InvestigationSummary from "@/components/game/InvestigationSummary";
import NominationStage from "@/components/game/NominationStage";
import PrivateReveal from "@/components/game/PrivateReveal";
import RoleDossier from "@/components/game/RoleDossier";
import VoteStage from "@/components/game/VoteStage";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";

export default function PlayerCaseView({
  game,
  selectedIds,
  onToggleTarget,
  onSubmitAction,
  busy,
  connectionBlocked,
  nomineeId,
  onSelectNominee,
  onSubmitNomination,
  onVote,
  onAcknowledgeRole,
  onNavigate,
}: {
  game: PlayerGameProjection;
  selectedIds: string[];
  onToggleTarget: (id: string) => void;
  onSubmitAction: () => void;
  busy: boolean;
  connectionBlocked: boolean;
  nomineeId: string | null;
  onSelectNominee: (id: string | null) => void;
  onSubmitNomination: () => void;
  onVote: (nominationId: string, intent: boolean) => void;
  onAcknowledgeRole: () => void;
  onNavigate: (view: PlayerView) => void;
}) {
  const mode = selectPlayerPresentation(game);
  const nameById = new Map(game.players.map((p) => [p.id, p.displayName]));
  const roster = [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat);
  const votingNomination = selectActiveVotingNomination(game);
  const resolvedNominations = game.nominations
    .filter((n) => n.status === "LOCKED" || n.status === "RESOLVED")
    .sort((a, b) => b.sequence - a.sequence);
  const lastResolved: PlayerNominationDto | null = resolvedNominations[0] ?? null;

  // The full-screen reveal replaces everything, including the bottom nav.
  if (mode === "ROLE_REVEAL" && game.myRole) {
    return (
      <PrivateReveal
        role={game.myRole}
        nameById={nameById}
        busy={busy}
        onAcknowledge={onAcknowledgeRole}
      />
    );
  }

  let primary: React.ReactNode = null;
  switch (mode) {
    case "GAME_ENDED":
      if (game.result) {
        primary = <GameEndedStage winner={game.result.winner} reason={game.result.reason} />;
      }
      break;
    case "OPERATIONAL_REQUIRED":
    case "OPERATIONAL_WAITING":
      if (game.activeAction) {
        primary = (
          <CurrentActionStage
            actionKind={game.activeAction.kind}
            requiredTargets={requiredTargetCount(game.activeAction.kind)}
            roster={roster}
            mePlayerId={game.me.playerId}
            selectedIds={selectedIds}
            onToggle={onToggleTarget}
            onSubmit={onSubmitAction}
            busy={busy}
            connectionBlocked={connectionBlocked}
          />
        );
      }
      break;
    case "FORMAL_VOTING":
      if (votingNomination) {
        primary = (
          <VoteStage
            nomination={votingNomination}
            isMyTurn={
              votingNomination.passStatus === "RUNNING" &&
              votingNomination.currentVirtualSeat === game.me.virtualSeat
            }
            meAlive={game.me.alive}
            ghostVoteAvailable={game.me.ghostVoteAvailable}
            busy={busy}
            connectionBlocked={connectionBlocked}
            onVote={(intent) => onVote(votingNomination.id, intent)}
          />
        );
      }
      break;
    case "FORMAL_NOMINATION": {
      const livingOthers = game.players.filter(
        (p) => p.alive && p.id !== game.me.playerId,
      );
      primary = (
        <NominationStage
          candidateName={
            game.investigation?.currentExecutionCandidatePlayerId
              ? (nameById.get(game.investigation.currentExecutionCandidatePlayerId) ?? null)
              : null
          }
          candidateVotes={game.investigation?.currentHighEffectiveVotes ?? null}
          livingOthers={livingOthers}
          meAlive={game.me.alive}
          meGhostVoteAvailable={game.me.ghostVoteAvailable}
          nomineeId={nomineeId}
          onSelectNominee={onSelectNominee}
          onSubmitNomination={onSubmitNomination}
          busy={busy}
        />
      );
      break;
    }
    case "INVESTIGATION":
      primary = (
        <InvestigationSummary game={game} resolvedNomination={lastResolved} onNavigate={onNavigate} />
      );
      break;
    case "WAITING":
      primary = (
        <WaitingCard
          role={game.myRole}
          nameById={nameById}
        />
      );
      break;
  }

  return (
    <div className="flex flex-col gap-3">
      {connectionBlocked && (
        <Notice variant="warning" assertive>
          Brak połączenia — dane mogą być nieaktualne.
        </Notice>
      )}
      {primary}
    </div>
  );
}

/** Pre-game waiting state. The role is reachable only through an intentionally
 *  private action — never displayed casually (audit 18 §5.4). */
function WaitingCard({
  role,
  nameById,
}: {
  role: PlayerGameProjection["myRole"];
  nameById: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Surface variant="system" className="text-center">
      <p className="eyebrow">Tożsamość</p>
      <p className="mt-3 text-base text-ink-primary">
        {role ? "Rola potwierdzona — czekamy na rozpoczęcie sprawy." : "Czekamy na rozpoczęcie sprawy."}
      </p>
      {role && (
        <Button variant="quiet" className="mt-3" onClick={() => setOpen(true)}>
          Pokaż rolę
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Twoja rola"
        description="Informacja prywatna — upewnij się, że nikt nie widzi ekranu."
      >
        {role && <RoleDossier role={role} nameById={nameById} />}
      </Dialog>
    </Surface>
  );
}
