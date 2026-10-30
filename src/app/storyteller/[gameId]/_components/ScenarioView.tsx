"use client";

// ScenarioView — runtime scenario state + collapsed Advanced overrides
// (spec 19 §7.5 / screen spec 21 §13). Human labels first; raw ids only as
// secondary detail. Overrides are not visible until expanded.

import { useState } from "react";
import { ChevronDown, Map as MapIcon, ScanLine } from "lucide-react";
import type { StorytellerGameProjection } from "@/lib/client-api";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";
import { mapVersionLabel, taskStateLabel } from "@/lib/presentation/labels";
import {
  scenarioClueOptions,
  scenarioMapOptions,
  scenarioStageOptions,
} from "@/lib/presentation/scenario-options";

const CLUE_OPTIONS = scenarioClueOptions();
const MAP_OPTIONS = scenarioMapOptions();
const STAGE_OPTIONS = scenarioStageOptions();

export default function ScenarioView({
  game,
  busy,
  revealClueId,
  onRevealClueIdChange,
  revealTargetPlayerId,
  onRevealTargetPlayerIdChange,
  stageInput,
  onStageInputChange,
  onRevealClue,
  onCompleteTask,
  onSetStage,
  onSetMap,
  onSetCondition,
}: {
  game: StorytellerGameProjection;
  busy: boolean;
  revealClueId: string;
  onRevealClueIdChange: (id: string) => void;
  revealTargetPlayerId: string;
  onRevealTargetPlayerIdChange: (id: string) => void;
  stageInput: string;
  onStageInputChange: (value: string) => void;
  onRevealClue: (clueId: string, targetPlayerId: string | null) => void;
  onCompleteTask: (taskId: string) => void;
  onSetStage: (stageId: string) => void;
  onSetMap: (mapVersionId: string) => void;
  onSetCondition: (conditionId: string, active: boolean) => void;
}) {
  const [overridesOpen, setOverridesOpen] = useState(false);
  const scenario = game.scenario;
  const sorted = [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat);
  const availableTasks = (scenario?.tasks ?? []).filter((t) => t.state !== "COMPLETED");
  const injured = scenario?.conditions.includes("INJURED") ?? false;
  const currentStage = (stageInput.trim() || scenario?.stageId) ?? "";
  const stageOptions = [
    { id: currentStage, label: `${currentStage || "—"} (bieżący)` },
    ...STAGE_OPTIONS.filter((o) => o.id !== currentStage),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Scenariusz</p>
          <p className="mt-1 text-meta text-ink-muted">panel prowadzącego</p>
        </div>
        {scenario && <Badge variant="neutral">etap: {scenario.stageId ?? "—"}</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* State */}
        <Surface variant="system">
          <p className="eyebrow">Stan</p>
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <p className="text-meta text-ink-muted">Mapa</p>
              <p className="mt-0.5 text-base text-ink-primary">
                {mapVersionLabel(scenario?.mapVersionId ?? null)}
              </p>
            </div>
            <div>
              <p className="text-meta text-ink-muted">Stany</p>
              {!scenario || scenario.conditions.length === 0 ? (
                <p className="mt-0.5 text-sm text-ink-muted">brak</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {scenario.conditions.map((condition) => (
                    <li key={condition}>
                      <Badge variant="rust">{condition === "INJURED" ? "ranny" : condition}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-meta text-ink-muted">Skanowania</p>
              {!scenario || scenario.scans.length === 0 ? (
                <p className="mt-0.5 text-sm text-ink-muted">brak</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1.5">
                  {scenario.scans.slice(-5).map((scan, index) => (
                    <li key={`${scan.qrTokenId}-${scan.playerId}-${index}`} className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
                      <ScanLine aria-hidden="true" className="h-3.5 w-3.5 text-ink-muted" />
                      <span className="text-ink-primary">{scan.playerName ?? scan.playerId}</span>
                      <span className="rounded-chip border border-line px-2 py-0.5 font-mono text-meta text-ink-muted">
                        {scan.qrTokenId}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Surface>

        {/* Clues */}
        <Surface variant="system">
          <p className="eyebrow">Wskazówki</p>
          {!scenario || scenario.clues.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Brak dowodów.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {scenario.clues.map((clue) => (
                <li key={clue.id} className="rounded-tile border border-line bg-card-soft/60 p-3">
                  <p className="text-sm text-ink-primary">{clue.title}</p>
                  <p className="mt-0.5 text-meta text-ink-muted">{clue.id}</p>
                </li>
              ))}
            </ol>
          )}
        </Surface>

        {/* Tasks */}
        <Surface variant="system">
          <p className="eyebrow">Zadania</p>
          {!scenario || scenario.tasks.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Brak zadań.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {scenario.tasks.map((task) => {
                const done = task.state === "COMPLETED";
                return (
                  <li key={task.id} className="rounded-tile border border-line bg-card-soft/60 p-3">
                    <p className="text-sm text-ink-primary">{task.title}</p>
                    <Badge variant={done ? "success" : "brass"} className="mt-1">
                      {taskStateLabel(task.state)}
                    </Badge>
                  </li>
                );
              })}
            </ol>
          )}
        </Surface>
      </div>

      {/* Advanced overrides — collapsed by default */}
      <Surface variant="system">
        <button
          type="button"
          onClick={() => setOverridesOpen((value) => !value)}
          aria-expanded={overridesOpen}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
        >
          <span className="eyebrow text-brass">Nadpisania zaawansowane</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 text-ink-muted transition-transform duration-150 ${overridesOpen ? "rotate-180" : ""}`}
          />
        </button>

        {overridesOpen && (
          <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
            <Notice variant="warning">
              Nadpisania zmieniają stan scenariusza dla wszystkich graczy. Używaj ich świadomie.
            </Notice>

            {/* Reveal clue */}
            <div className="flex flex-col gap-2">
              <p className="text-meta text-ink-muted">Odsłoń wskazówkę</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-40 flex-1">
                  <span className="sr-only">Wskazówka</span>
                  <select
                    value={revealClueId}
                    onChange={(event) => onRevealClueIdChange(event.target.value)}
                    className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-ink-primary"
                  >
                    {CLUE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label} · {option.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-40 flex-1">
                  <span className="sr-only">Dla gracza</span>
                  <select
                    value={revealTargetPlayerId}
                    onChange={(event) => onRevealTargetPlayerIdChange(event.target.value)}
                    className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-ink-primary"
                  >
                    <option value="">— wszyscy —</option>
                    {sorted.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="secondary" busy={busy} onClick={() => onRevealClue(revealClueId, revealTargetPlayerId || null)}>
                  Odsłoń
                </Button>
              </div>
            </div>

            {/* Complete task */}
            <div>
              <p className="text-meta text-ink-muted">Ukończ zadanie</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {availableTasks.length === 0 ? (
                  <span className="text-sm text-ink-muted">Brak dostępnych zadań.</span>
                ) : (
                  availableTasks.map((task) => (
                    <Button key={task.id} variant="secondary" busy={busy} onClick={() => onCompleteTask(task.id)}>
                      Ukończ: {task.title}
                    </Button>
                  ))
                )}
              </div>
            </div>

            {/* Set stage — enumerated options generated from scenario content */}
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1">
                <span className="mb-1 block text-meta text-ink-muted">Zmień etap</span>
                <select
                  value={stageOptions[0].id}
                  onChange={(event) => {
                    onStageInputChange(event.target.value);
                    if (event.target.value) onSetStage(event.target.value);
                  }}
                  className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-ink-primary"
                >
                  {stageOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Set map */}
            <div>
              <p className="text-meta text-ink-muted">Mapa</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {MAP_OPTIONS.map((option) => {
                  const active = scenario?.mapVersionId === option.id;
                  return (
                    <Button
                      key={option.id}
                      variant={active ? "secondary" : "quiet"}
                      aria-pressed={active}
                      busy={busy}
                      icon={<MapIcon aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => onSetMap(option.id)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* INJURED condition */}
            <div>
              <p className="text-meta text-ink-muted">Stan: ranny (INJURED)</p>
              <Button
                variant={injured ? "secondary" : "quiet"}
                aria-pressed={injured}
                busy={busy}
                className="mt-1"
                onClick={() => onSetCondition("INJURED", !injured)}
              >
                {injured ? "wyłącz" : "włącz"}
              </Button>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}
