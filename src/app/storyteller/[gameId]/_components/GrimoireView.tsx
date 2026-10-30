"use client";

// GrimoireView — the secret role board (spec 19 §7.4 / screen spec 21 §12).
// Candidate: validation summary, assignments, Drunk perceived role, red
// herring, Demon bluffs, regenerate + commit. Committed: read-only board with
// status badges. The Storyteller privacy cover blanks role names instantly.

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { StorytellerGameProjection } from "@/lib/client-api";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";
import { alignmentLabel } from "@/lib/presentation/labels";
import { characterDisplayName, type CharacterId } from "@/modules/trouble-brewing/characters";

const COVER = "▮▮▮▮";

export default function GrimoireView({
  game,
  busy,
  privacyCovered,
  onGenerateSetup,
  onCommitSetup,
}: {
  game: StorytellerGameProjection;
  busy: boolean;
  privacyCovered: boolean;
  onGenerateSetup: () => void;
  onCommitSetup: () => void;
}) {
  const [confirmCommit, setConfirmCommit] = useState(false);
  const setup = game.setup;
  const committed = setup?.committed ?? false;
  const candidate = setup?.candidate ?? null;
  const nameById = new Map(game.players.map((p) => [p.id, p.displayName]));

  const assignments = candidate
    ? [...candidate.assignments].sort((a, b) => a.virtualSeat - b.virtualSeat)
    : [];
  const evilCount = assignments.filter((a) => a.trueAlignment === "EVIL").length;
  const goodCount = assignments.length - evilCount;

  function roleName(id: string): string {
    if (privacyCovered) return COVER;
    return characterDisplayName(id as CharacterId);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Grimuar</p>
          <p className="mt-1 text-meta text-ink-muted">
            {committed ? "zatwierdzony — tylko do odczytu" : "niezatwierdzony układ ról"}
          </p>
        </div>
        {committed && <Badge variant="success">zatwierdzono</Badge>}
        {privacyCovered && <Badge variant="brass">zasłonięto — bezpieczne na projektorze</Badge>}
      </div>

      {!candidate ? (
        <Surface variant="system">
          <p className="text-sm text-ink-secondary">
            {game.isReady
              ? "Krąg jest gotowy — wygeneruj tajny układ ról."
              : "Uzupełnij krąg, aby wygenerować układ."}
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            busy={busy}
            disabled={!game.isReady}
            icon={<RefreshCw aria-hidden="true" className="h-4 w-4" />}
            onClick={onGenerateSetup}
          >
            Wygeneruj układ
          </Button>
        </Surface>
      ) : (
        <>
          {/* Distribution summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Surface variant="soft">
              <p className="eyebrow">Uczestnicy</p>
              <p className="mt-1 text-lg font-semibold text-ink-primary">{assignments.length}</p>
            </Surface>
            <Surface variant="soft">
              <p className="eyebrow">Dobro</p>
              <p className="mt-1 text-lg font-semibold text-success">{goodCount}</p>
            </Surface>
            <Surface variant="soft">
              <p className="eyebrow">Zło</p>
              <p className="mt-1 text-lg font-semibold text-danger">{evilCount}</p>
            </Surface>
            <Surface variant="soft">
              <p className="eyebrow">Układ</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-ink-primary">
                {setup?.regenerationIndex ?? 0}
              </p>
            </Surface>
          </div>

          {/* Assignments */}
          <Surface variant={committed ? "system" : "secret"}>
            <p className="eyebrow text-brass">Przydział ról</p>
            <ol className="mt-3 flex flex-col gap-2">
              {assignments.map((a) => {
                const isRedHerring = a.playerId === candidate.fortuneTellerRedHerringPlayerId;
                const isDrunk = a.trueCharacterId === "DRUNK";
                return (
                  <li
                    key={a.playerId}
                    className={
                      isRedHerring && !privacyCovered
                        ? "rounded-tile border border-rust/60 bg-rust/10 p-3"
                        : "rounded-tile border border-line bg-card-soft/60 p-3"
                    }
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                        {a.virtualSeat + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-base text-ink-primary">
                        {nameById.get(a.playerId) ?? a.playerId}
                      </span>
                      <span className="min-w-0 text-right text-sm text-ink-secondary">
                        {roleName(a.trueCharacterId)}
                        {!privacyCovered && isDrunk && a.perceivedCharacterId !== a.trueCharacterId && (
                          <span className="text-ink-muted">
                            {" "}
                            → {characterDisplayName(a.perceivedCharacterId as CharacterId)}
                          </span>
                        )}
                      </span>
                      {/* Alignment is secret too — the cover blanks it. */}
                      <Badge variant={privacyCovered ? "neutral" : a.trueAlignment === "EVIL" ? "danger" : "success"}>
                        {privacyCovered ? COVER : alignmentLabel(a.trueAlignment)}
                      </Badge>
                    </div>
                    {isRedHerring && !privacyCovered && (
                      <p className="mt-1 pl-11 text-meta text-ink-secondary">czerwony śledź Wróżbitki</p>
                    )}
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 rounded-tile border border-line bg-card-soft/60 p-3">
              <p className="eyebrow mb-1.5 text-moss">Bluffy Demona</p>
              <p className="text-sm text-ink-secondary">
                {privacyCovered
                  ? COVER
                  : candidate.demonBluffs
                      .map((id) => characterDisplayName(id as CharacterId))
                      .join(", ")}
              </p>
            </div>
          </Surface>

          {!committed && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" busy={busy} icon={<RefreshCw aria-hidden="true" className="h-4 w-4" />} onClick={onGenerateSetup}>
                Przegeneruj
              </Button>
              <Button variant="formal" busy={busy} onClick={() => setConfirmCommit(true)}>
                Zatwierdź układ
              </Button>
            </div>
          )}

          {committed && (
            <Notice variant="private">
              Układ zatwierdzony i zablokowany. Od teraz role mogą zostać ujawnione graczom.
            </Notice>
          )}
        </>
      )}

      <Dialog
        open={confirmCommit}
        onClose={() => setConfirmCommit(false)}
        title="Zatwierdź grimoire"
        description="Po zatwierdzeniu role graczy mogą zostać ujawnione, a skład kręgu zostaje zablokowany. Tej operacji nie można cofnąć."
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmCommit(false)}>
              Anuluj
            </Button>
            <Button
              variant="formal"
              busy={busy}
              onClick={() => {
                setConfirmCommit(false);
                onCommitSetup();
              }}
            >
              Zatwierdź układ
            </Button>
          </>
        }
      />
    </div>
  );
}
