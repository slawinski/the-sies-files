"use client";

// InvestigationSummary — the "AKTA / TERAZ" screen during free investigation
// (screen spec 21 §1): calm, phase-aware, one evidence dossier, one task,
// a map preview. No metric cards merely because the prototype had them.

import { Map as MapIcon, NotebookPen } from "lucide-react";
import type { PlayerGameProjection, PlayerNominationDto } from "@/lib/client-api";
import MapCard from "@/components/MapCard";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import DossierDocument from "@/components/ui/DossierDocument";
import StatTile from "@/components/ui/StatTile";
import Surface from "@/components/ui/Surface";
import { characterDisplayName } from "@/modules/trouble-brewing/characters";
import type { PlayerView } from "@/lib/presentation/types";
import { DeliveredInfoText } from "./DeliveredInfo";

export default function InvestigationSummary({
  game,
  resolvedNomination,
  onNavigate,
}: {
  game: PlayerGameProjection;
  /** Most recent closed nomination for the "ostatnie zdarzenie" row. */
  resolvedNomination: PlayerNominationDto | null;
  onNavigate: (view: PlayerView) => void;
}) {
  const me = game.me;
  const scenario = game.scenario;
  const clues = scenario?.clues ?? [];
  const latestClue = clues.length > 0 ? clues[clues.length - 1] : null;
  const activeTask = (scenario?.tasks ?? []).find((t) => t.state !== "COMPLETED") ?? null;
  const aliveCount = game.players.filter((p) => p.alive).length;
  const deadCount = game.players.length - aliveCount;
  const nameById = new Map(game.players.map((p) => [p.id, p.displayName]));

  return (
    <div className="flex flex-col gap-3">
      {/* Two status tiles max (screen spec 21 §1) */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Stan"
          value={me.alive ? "Żyjesz" : "Nie żyjesz"}
          tone={me.alive ? "moss" : "rust"}
        />
        <StatTile
          label="Głos ducha"
          value={me.alive ? "—" : me.ghostVoteAvailable ? "dostępny" : "zużyty"}
          tone={me.alive ? "neutral" : me.ghostVoteAvailable ? "brass" : "neutral"}
        />
      </div>

      {/* AKTA / TERAZ — the current evidence dossier */}
      <section aria-labelledby="akta-teraz">
        <h2 id="akta-teraz" className="eyebrow mb-2">
          Akta · teraz
        </h2>
        {latestClue ? (
          <DossierDocument
            eyebrow="nowa wskazówka"
            title={latestClue.title}
            body={<p>{latestClue.body}</p>}
            stamp="dowód"
          >
            <Button variant="quiet" icon={<NotebookPen aria-hidden="true" className="h-4 w-4" />} onClick={() => onNavigate("journal")}>
              Otwórz w dzienniku
            </Button>
          </DossierDocument>
        ) : (
          <Surface variant="soft">
            <p className="text-sm text-ink-muted">Nie otrzymałeś jeszcze żadnych dowodów.</p>
          </Surface>
        )}
      </section>

      {/* Current task */}
      {activeTask && (
        <section aria-label="Aktywne zadanie">
          <Surface variant="system">
            <p className="eyebrow">Aktywne zadanie</p>
            <p className="mt-2 text-base leading-snug text-ink-primary">{activeTask.title}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <Badge variant="brass">do zrobienia</Badge>
              <Button variant="quiet" icon={<MapIcon aria-hidden="true" className="h-4 w-4" />} onClick={() => onNavigate("map")}>
                Mapa
              </Button>
            </div>
          </Surface>
        </section>
      )}

      {/* Ostatnie zdarzenie */}
      <section aria-label="Ostatnie zdarzenie">
        <Surface variant="soft">
          <p className="eyebrow mb-2">Ostatnie zdarzenie</p>
          {resolvedNomination ? (
            <p className="text-sm text-ink-primary">
              Nominacje zamknięte —{" "}
              {resolvedNomination.nominatorName ?? "—"} → {resolvedNomination.nomineeName ?? "—"}
              {resolvedNomination.qualified ? " · kandydat do egzekucji" : ""}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Nominacje jeszcze zamknięte.</p>
          )}
        </Surface>
      </section>

      {/* Map preview — the terrain stays discoverable from Akta */}
      <section aria-label="Podgląd mapy">
        <Surface variant="map">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="eyebrow">Mapa</p>
            <Button variant="quiet" size="sm" onClick={() => onNavigate("map")}>
              Otwórz
            </Button>
          </div>
          <MapCard map={scenario?.map ?? null} mapVersionId={scenario?.mapVersionId ?? null} />
        </Surface>
      </section>

      {/* Received information (operational night results) */}
      {game.deliveredInfo.length > 0 && (
        <section aria-label="Otrzymane informacje">
          <Surface variant="system">
            <p className="eyebrow">Otrzymane informacje</p>
            <ul className="mt-3 flex flex-col gap-2">
              {game.deliveredInfo.map((item) => (
                <li key={item.actionId} className="rounded-tile border border-line bg-card-soft/60 p-3">
                  <p className="text-meta text-ink-muted">{characterDisplayName(item.kind)}</p>
                  <p className="mt-1 text-sm text-ink-primary">
                    <DeliveredInfoText item={item} nameById={nameById} />
                  </p>
                </li>
              ))}
            </ul>
          </Surface>
        </section>
      )}

      {/* Alive/dead mini-summary for quick scan */}
      <p className="text-center text-meta text-ink-muted">
        {aliveCount} żyje · {deadCount} nie żyje · cykl {game.cycleNumber}
      </p>
    </div>
  );
}
