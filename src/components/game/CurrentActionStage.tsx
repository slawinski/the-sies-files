"use client";

// CurrentActionStage — one action, one instruction, one target decision
// (audit 18 §5.5 / screen spec 21 §3). The full-width primary stage of the
// Akta view during the operational phase.

import type { PublicPlayerDto } from "@/lib/client-api";
import { actionKindCharacter } from "@/lib/presentation/labels";
import Button from "@/components/ui/Button";
import Surface from "@/components/ui/Surface";
import Notice from "@/components/ui/Notice";
import PlayerTargetPicker from "./PlayerTargetPicker";

export default function CurrentActionStage({
  actionKind,
  requiredTargets,
  roster,
  mePlayerId,
  selectedIds,
  onToggle,
  onSubmit,
  busy,
  connectionBlocked,
}: {
  actionKind: string;
  /** null = the action is being resolved by the Storyteller right now. */
  requiredTargets: number | null;
  roster: PublicPlayerDto[];
  mePlayerId: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSubmit: () => void;
  busy: boolean;
  connectionBlocked: boolean;
}) {
  const character = actionKindCharacter(actionKind);

  if (requiredTargets === null) {
    return (
      <Surface variant="secret">
        <p className="eyebrow text-brass">Cicha akcja · tylko dla Ciebie</p>
        {character && (
          <h2 className="display mt-2 text-xl leading-tight text-ink-primary">{character}</h2>
        )}
        <p className="mt-3 text-base text-ink-secondary">
          Czekam na rozstrzygnięcie Mistrza Gry…
        </p>
      </Surface>
    );
  }

  const max = requiredTargets;
  const ready = selectedIds.length === max;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onToggle(id);
      return;
    }
    if (selectedIds.length < max) onToggle(id);
  }

  return (
    <Surface variant="secret">
      <p className="eyebrow text-brass">Cicha akcja · tylko dla Ciebie</p>
      <h2 className="display mt-2 text-xl leading-tight text-ink-primary">
        {max === 1 ? "Wybierz jedną osobę" : "Wybierz dwie osoby"}
      </h2>
      {character && (
        <p className="mt-1 text-sm text-ink-muted">
          {character} · wybór {selectedIds.length} z {max}
        </p>
      )}

      <div className="mt-4">
        <PlayerTargetPicker
          players={roster}
          selectedIds={selectedIds}
          mePlayerId={mePlayerId}
          onToggle={toggle}
        />
      </div>

      {connectionBlocked && (
        <Notice variant="warning" className="mt-3">
          Brak połączenia — poczekaj na powrót sieci, zanim zatwierdzisz wybór.
        </Notice>
      )}

      <Button
        fullWidth
        size="lg"
        busy={busy}
        disabled={!ready || connectionBlocked}
        className="mt-4"
        onClick={onSubmit}
      >
        Zatwierdź wybór
      </Button>
      <p className="mt-2 text-center text-meta text-ink-muted">
        Po wysłaniu wybór może być nieodwracalny.
      </p>
    </Surface>
  );
}
