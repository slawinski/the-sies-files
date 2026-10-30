"use client";

// PlayerJournalView — persistent memory without mirroring the Storyteller
// audit (screen spec 21 §5). Dark product timeline; paper only for content
// artifacts. Time is secondary — the player projection carries no per-item
// timestamps, so events are ordered semantically.

import { FileText, Map as MapIcon, Vote } from "lucide-react";
import type { PlayerGameProjection } from "@/lib/client-api";
import Timeline, { type TimelineEvent } from "@/components/ui/Timeline";
import DossierDocument from "@/components/ui/DossierDocument";
import { DeliveredInfoText } from "@/components/game/DeliveredInfo";
import { characterDisplayName } from "@/modules/trouble-brewing/characters";
import { nominationStatusLabel } from "@/lib/presentation/labels";

export default function PlayerJournalView({ game }: { game: PlayerGameProjection }) {
  const nameById = new Map(game.players.map((p) => [p.id, p.displayName]));
  const scenario = game.scenario;

  const events: TimelineEvent[] = [];

  for (const clue of scenario?.clues ?? []) {
    events.push({
      id: `clue-${clue.id}`,
      icon: FileText,
      tone: "moss",
      label: "Otrzymano nową wskazówkę",
      detail: <DossierDocument eyebrow="dowód" title={clue.title} body={<p>{clue.body}</p>} />,
    });
  }

  for (const item of game.deliveredInfo) {
    events.push({
      id: `info-${item.actionId}`,
      icon: FileText,
      tone: "moss",
      label: `Informacja: ${characterDisplayName(item.kind)}`,
      detail: (
        <p className="text-sm text-ink-secondary">
          <DeliveredInfoText item={item} nameById={nameById} />
        </p>
      ),
    });
  }

  for (const nomination of [...game.nominations].sort((a, b) => b.sequence - a.sequence)) {
    if (nomination.status !== "LOCKED" && nomination.status !== "RESOLVED") continue;
    events.push({
      id: `nom-${nomination.id}`,
      icon: Vote,
      tone: "rust",
      label: `Nominacje: ${nomination.nominatorName ?? "—"} → ${nomination.nomineeName ?? "—"}`,
      detail: (
        <p className="text-sm text-ink-secondary">
          {nominationStatusLabel(nomination.status)} · {nomination.effectiveTotal} głosów ·{" "}
          {nomination.qualified ? "kandydat" : "nie przeszło"}
        </p>
      ),
    });
  }

  if (scenario?.mapVersionId === "MAP_EXTENDED") {
    events.push({
      id: "map-extended",
      icon: MapIcon,
      tone: "brass",
      label: "Mapa została uzupełniona",
      detail: <p className="text-sm text-ink-secondary">Nowy obszar jest teraz dostępny.</p>,
    });
  }

  for (const task of scenario?.tasks ?? []) {
    if (task.state !== "COMPLETED") continue;
    events.push({
      id: `task-${task.id}`,
      icon: FileText,
      tone: "moss",
      label: `Zadanie ukończone: ${task.title}`,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <header>
        <p className="eyebrow">Dziennik</p>
        <p className="mt-1 text-meta text-ink-muted">cykl {game.cycleNumber}</p>
      </header>

      <div className="rounded-card border border-line bg-card/60 p-4">
        <Timeline events={events} emptyLabel="Dziennik jest pusty — zdarzenia pojawią się w trakcie gry." />
      </div>
    </div>
  );
}
