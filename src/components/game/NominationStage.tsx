"use client";

// NominationStage — formal-mode nomination (audit 18 UX-04 / screen spec 21 §6).
// Terrain activity is visually suppressed; the nomination is the only primary
// action. Hard-to-undo, so the submit passes through a confirmation dialog.

import { useState } from "react";
import type { PublicPlayerDto } from "@/lib/client-api";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";
import Dialog from "@/components/ui/Dialog";
import PersonTile from "@/components/ui/PersonTile";

export default function NominationStage({
  candidateName,
  candidateVotes,
  livingOthers,
  meAlive,
  meGhostVoteAvailable,
  nomineeId,
  onSelectNominee,
  onSubmitNomination,
  busy,
}: {
  candidateName: string | null;
  candidateVotes: number | null;
  livingOthers: PublicPlayerDto[];
  meAlive: boolean;
  meGhostVoteAvailable: boolean;
  nomineeId: string | null;
  onSelectNominee: (id: string | null) => void;
  onSubmitNomination: () => void;
  busy: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const nomineeName = livingOthers.find((p) => p.id === nomineeId)?.displayName ?? null;

  return (
    <Surface variant="formal">
      <p className="eyebrow text-rust">Nominacje · tryb formalny</p>
      <h2 className="display mt-2 text-xl leading-tight text-ink-primary">Kogo nominujesz?</h2>

      <div className="mt-3 flex items-center gap-2">
        <Badge variant={candidateName ? "rust" : "neutral"}>
          {candidateName
            ? `Kandydat: ${candidateName}${candidateVotes != null ? ` (${candidateVotes} głosów)` : ""}`
            : "Brak kandydata"}
        </Badge>
      </div>

      {livingOthers.length === 0 ? (
        <p className="mt-4 text-sm text-ink-secondary">Brak żywych graczy do nominowania.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          {livingOthers.map((player) => (
            <PersonTile
              key={player.id}
              seat={player.virtualSeat}
              name={player.displayName}
              selected={nomineeId === player.id}
              isSelf={false}
              onClick={() => onSelectNominee(nomineeId === player.id ? null : player.id)}
            />
          ))}
        </div>
      )}

      {!meAlive && (
        <p className="mt-3 text-meta text-ink-muted">Martwi gracze nie mogą nominować.</p>
      )}
      {!meAlive && meGhostVoteAvailable && (
        <Notice variant="info" className="mt-3">
          Jesteś martwy — masz jeszcze głos ducha do wykorzystania w głosowaniu.
        </Notice>
      )}

      <Button
        variant="formal"
        fullWidth
        size="lg"
        busy={busy}
        disabled={!nomineeId || !meAlive}
        className="mt-4"
        onClick={() => setConfirmOpen(true)}
      >
        Nominuj
      </Button>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Potwierdź nominację"
        description={
          <>
            Nominujesz <span className="font-semibold text-ink-primary">{nomineeName ?? "—"}</span>.
            Nominacja jest trudna do cofnięcia.
          </>
        }
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmOpen(false)}>
              Anuluj
            </Button>
            <Button
              variant="formal"
              busy={busy}
              onClick={() => {
                setConfirmOpen(false);
                onSubmitNomination();
              }}
            >
              Nominuj
            </Button>
          </>
        }
      />
    </Surface>
  );
}
