"use client";

// ControlView — the Control Home (audit 18 UX-02 / spec 19 §7.2 / screen spec
// 21 §9). The active blocker always gets the largest, highest card; the rest
// of the session is subordinate. No audit log lives here.

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  ListChecks,
  Map as MapIcon,
  ScanLine,
  Users,
} from "lucide-react";
import type {
  InfoResultDto,
  StorytellerControlDto,
  StorytellerGameProjection,
  StorytellerResolutionDto,
} from "@/lib/client-api";
import type { RealtimeHealth } from "@/components/useGameEventStream";
import type { StorytellerBlocker } from "@/lib/presentation/storyteller-mode";
import type { StorytellerView } from "@/lib/presentation/types";
import ActionDecisionPanel from "@/components/ActionDecisionPanel";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import StatTile from "@/components/ui/StatTile";
import Surface from "@/components/ui/Surface";
import { characterDisplayName } from "@/modules/trouble-brewing/characters";
import { STEP_CHARACTER, type StepKind } from "@/modules/trouble-brewing/script";
import {
  mapVersionLabel,
  nominationStatusLabel,
  winnerLabel,
} from "@/lib/presentation/labels";

const REGISTRATION_DESCRIPTION_LABELS: Record<string, string> = {
  "true registration": "prawdziwa rejestracja",
  "register as evil": "rejestruje się jako zły",
  "register as good": "rejestruje się jako dobry",
  "register as a Minion": "rejestruje się jako Sługus",
  "register as the Demon": "rejestruje się jako Demon",
  "register as a Townsfolk": "rejestruje się jako Mieszczanin",
  "register as an Outsider": "rejestruje się jako Odludek",
};

function registrationOptionLabel(description: string): string {
  return REGISTRATION_DESCRIPTION_LABELS[description] ?? description;
}

function isInfoResult(value: unknown): value is InfoResultDto {
  if (typeof value !== "object" || value === null) return false;
  return "kind" in value && typeof (value as { kind?: unknown }).kind === "string";
}

function resolutionText(result: unknown, nameById: Map<string, string>): string {
  if (isInfoResult(result)) {
    switch (result.kind) {
      case "CHARACTER_CANDIDATES":
        return `${characterDisplayName(result.characterId)}: ${result.candidatePlayerIds
          .map((id) => nameById.get(id) ?? id)
          .join(", ")}`;
      case "CHARACTER":
        return `${characterDisplayName(result.characterId)} — ${nameById.get(result.playerId) ?? result.playerId}`;
      case "NUMBER":
        return `Liczba: ${result.value}`;
      case "NO_OUTSIDERS":
        return "brak outsiderów";
      case "DEMON_YES_NO":
        return result.value ? "Tak" : "Nie";
      case "GRIMOIRE":
        return `Pełna lista ról (${result.assignments.length})`;
    }
  }
  if (result && typeof result === "object" && "targetPlayerIds" in result) {
    const ids = (result as { targetPlayerIds?: string[] }).targetPlayerIds ?? [];
    return `Wybrani: ${ids.map((id) => nameById.get(id) ?? id).join(", ")}`;
  }
  return "rozstrzygnięto";
}

export default function ControlView({
  game,
  blocker,
  control,
  realtime,
  nameById,
  busy,
  gameEnded,
  ready,
  need,
  privacyCovered = false,
  onStartOperational,
  onCompleteOperational,
  onResolveAction,
  onOpenNominations,
  onCloseNominations,
  onStartVoting,
  onAdvanceVoting,
  onLockVote,
  onResolveTrigger,
  onResolveExecution,
  onCloseInvestigation,
  onExileTraveller,
  onNavigate,
}: {
  game: StorytellerGameProjection;
  blocker: StorytellerBlocker;
  control: StorytellerControlDto | null;
  realtime: RealtimeHealth;
  nameById: Map<string, string>;
  busy: boolean;
  gameEnded: boolean;
  ready: boolean;
  need: number;
  /** Projector safety: masks secret resolutions while covered. */
  privacyCovered?: boolean;
  onStartOperational: () => void;
  onCompleteOperational: () => void;
  onResolveAction: (actionId: string, resolution: StorytellerResolutionDto | undefined) => void;
  onOpenNominations: () => void;
  onCloseNominations: () => void;
  onStartVoting: (nominationId: string) => void;
  onAdvanceVoting: (nominationId: string) => void;
  onLockVote: (nominationId: string) => void;
  onResolveTrigger: (nominationId: string, optionId: string) => void;
  onResolveExecution: () => void;
  onCloseInvestigation: () => void;
  onExileTraveller: (playerId: string) => void;
  onNavigate: (view: StorytellerView) => void;
}) {
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    action: () => void;
    variant: "formal" | "danger";
  } | null>(null);

  const actions = game.operational?.actions ?? [];
  const waitingForStoryteller = actions.find((a) => a.status === "WAITING_FOR_STORYTELLER") ?? null;
  const waitingForPlayer = actions.find((a) => a.status === "WAITING_FOR_PLAYER") ?? null;
  const unresolved = actions.filter((a) => a.status !== "RESOLVED");
  const sortedPlayers = [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat);
  const triggerNomination = game.nominations.find((n) => n.status === "DAY_TRIGGER_RESOLUTION") ?? null;
  const voting = game.nominations.filter((n) => n.status === "VOTING");
  const candidateId = game.investigation?.currentExecutionCandidatePlayerId ?? null;
  const candidateName = candidateId ? (nameById.get(candidateId) ?? candidateId) : null;
  const travellers = game.players.filter((p) => p.participantKind === "TRAVELLER" && p.alive);

  const presenceOnline = (control?.presence ?? []).filter((p) => p.connection === "ONLINE").length;
  const presenceStale = (control?.presence ?? []).filter((p) => p.connection === "STALE").length;
  const consistencyOk = (control?.consistencyIssues ?? []).every((issue) => issue.ok);
  const scenario = game.scenario;
  const lastScan = scenario && scenario.scans.length > 0 ? scenario.scans[scenario.scans.length - 1] : null;
  const aliveCount = game.players.filter((p) => p.alive).length;
  const deadCount = game.players.length - aliveCount;

  function openConfirm(
    title: string,
    description: string,
    action: () => void,
    variant: "formal" | "danger" = "formal",
  ) {
    setConfirm({ title, description, action, variant });
  }

  return (
    <div className="flex flex-col gap-4">
      {game.result && (
        <Surface
          variant={game.result.winner === "EVIL" ? "formal" : "system"}
          className={game.result.winner === "EVIL" ? undefined : "border-success/40 bg-success/5"}
        >
          <p className="eyebrow">Wynik sprawy</p>
          <h2 className="display mt-1 text-2xl leading-tight text-ink-primary">
            {winnerLabel(game.result.winner)}
          </h2>
          {game.result.reason && <p className="mt-1 text-sm text-ink-secondary">{game.result.reason}</p>}
        </Surface>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Primary blocker — the largest, highest card */}
        <Surface
          variant={blocker.kind === "ST_DECISION" || blocker.kind === "DAY_TRIGGER_DECISION" ? "formal" : "system"}
          className="xl:col-span-2"
        >
          <p className="eyebrow text-brass">Teraz</p>
          <h2 className="display mt-1 text-xl leading-tight text-ink-primary">{blocker.title}</h2>
          {blocker.description && (
            <p className="mt-1.5 text-sm text-ink-secondary">{blocker.description}</p>
          )}
          {blocker.actorName && <Badge variant="brass" className="mt-2">{blocker.actorName}</Badge>}

          <div className="mt-4">
            {blocker.kind === "ST_DECISION" && waitingForStoryteller && (
              privacyCovered ? (
                <p className="text-sm text-ink-secondary">
                  Zasłonięto — odsłoń widok, aby zobaczyć i rozstrzygnąć decyzję.
                </p>
              ) : (
                <ActionDecisionPanel
                  gameId={game.gameId}
                  action={waitingForStoryteller}
                  players={game.players}
                  busy={busy}
                  onSubmit={(resolution) =>
                    onResolveAction(waitingForStoryteller.id, resolution)
                  }
                />
              )
            )}

            {blocker.kind === "DAY_TRIGGER_DECISION" && triggerNomination?.decision && (
              <div className="flex flex-wrap gap-2">
                {triggerNomination.decision.options.map((option) => (
                  <Button
                    key={option.optionId}
                    variant="formal"
                    disabled={busy || gameEnded}
                    onClick={() => onResolveTrigger(triggerNomination.id, option.optionId)}
                  >
                    {registrationOptionLabel(option.description)}
                  </Button>
                ))}
              </div>
            )}

            {blocker.kind === "PLAYER_WAITING" && (
              <p className="flex items-center gap-2 text-sm text-ink-secondary">
                <Activity aria-hidden="true" className="h-4 w-4 animate-pulse text-brass" />
                Czekamy na wybór gracza — akcja zostanie rozstrzygnięta po jego decyzji.
              </p>
            )}

            {blocker.kind === "VOTING_START" && (
              <Button
                variant="formal"
                disabled={busy || gameEnded}
                onClick={() => {
                  const n = voting.find((v) => v.passStatus === "READY");
                  if (n) onStartVoting(n.id);
                }}
              >
                Rozpocznij głosowanie
              </Button>
            )}

            {blocker.kind === "VOTING_ADVANCE" && (
              <Button
                variant="secondary"
                disabled={busy || gameEnded}
                onClick={() => {
                  const n = voting.find((v) => v.passStatus === "RUNNING");
                  if (n) onAdvanceVoting(n.id);
                }}
              >
                Dalej — następny głos
              </Button>
            )}

            {blocker.kind === "VOTING_LOCK" && (
              <Button
                variant="formal"
                disabled={busy || gameEnded}
                onClick={() => {
                  const n = voting.find((v) => v.passStatus === "COMPLETE");
                  if (n) onLockVote(n.id);
                }}
              >
                Zablokuj głosowanie
              </Button>
            )}

            {blocker.kind === "PHASE_ADVANCE_OPERATIONAL" && (
              <Button
                variant="formal"
                disabled={busy}
                onClick={() =>
                  openConfirm(
                    "Zakończ fazę operacyjną",
                    "Zamykasz kolejkę działań i przechodzisz do śledztwa. Nierozstrzygnięte możliwości zostaną utracone.",
                    onCompleteOperational,
                  )
                }
              >
                Zakończ fazę operacyjną
              </Button>
            )}

            {blocker.kind === "EXECUTION_RESOLVE" && (
              <Button
                variant="formal"
                disabled={busy || gameEnded}
                onClick={() =>
                  openConfirm(
                    "Wykonaj egzekucję",
                    `Egzekucja: ${candidateName ?? "—"}. Ten krok zmienia stan gry i może zakończyć sprawę.`,
                    onResolveExecution,
                  )
                }
              >
                Wykonaj egzekucję
              </Button>
            )}

            {blocker.kind === "CLOSE_INVESTIGATION" && (
              <Button
                variant="formal"
                disabled={busy || gameEnded}
                onClick={() =>
                  openConfirm(
                    "Zamknij śledztwo",
                    "Zamykasz bieżący cykl i wracasz do nocy. Otwarte możliwości śledztwa zostaną utracone.",
                    onCloseInvestigation,
                  )
                }
              >
                Zamknij śledztwo
              </Button>
            )}

            {blocker.kind === "NOMINATIONS_OPEN" && (
              <Button variant="formal" disabled={busy || gameEnded} onClick={onOpenNominations}>
                Otwórz nominacje
              </Button>
            )}

            {blocker.kind === "ROSTER_INCOMPLETE" && (
              <Button
                disabled={busy}
                icon={<Users aria-hidden="true" className="h-4 w-4" />}
                onClick={() => onNavigate("players")}
              >
                Uzupełnij krąg
              </Button>
            )}

            {blocker.kind === "SETUP_COMMIT" && (
              <Button
                disabled={busy}
                icon={<ListChecks aria-hidden="true" className="h-4 w-4" />}
                onClick={() => onNavigate("grimoire")}
              >
                Otwórz grimoire
              </Button>
            )}

            {blocker.kind === "START_OPERATIONAL" && (
              <Button disabled={busy} onClick={onStartOperational}>
                Rozpocznij fazę operacyjną
              </Button>
            )}

            {blocker.kind === "NONE" && (
              <p className="text-sm text-ink-muted">Brak aktywnego blokera — sesja w równowadze.</p>
            )}
          </div>
        </Surface>

        {/* Session health */}
        <div className="flex flex-col gap-3">
          <Surface variant="system">
            <p className="eyebrow">Zdrowie sesji</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatTile label="Połączenie" value={realtime} tone={realtime === "LIVE" ? "success" : realtime === "RECONNECTING" ? "brass" : "danger"} />
              <StatTile label="Wersja" value={game.version} tone="neutral" />
            </div>
            {control && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant={consistencyOk ? "success" : "danger"}>
                  {consistencyOk ? "spójność OK" : "niespójność!"}
                </Badge>
                <Badge variant="neutral">{presenceOnline} online</Badge>
                {presenceStale > 0 && <Badge variant="brass">{presenceStale} stale</Badge>}
              </div>
            )}
          </Surface>

          <Surface variant="soft">
            <p className="eyebrow">Gracze</p>
            <p className="mt-2 text-lg font-semibold text-ink-primary">
              {aliveCount} żyje · {deadCount} nie żyje
            </p>
            <p className="mt-1 text-meta text-ink-muted">
              {ready ? "krąg gotowy" : `brakuje ${need} do gotowości`}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="moss">{game.players.filter((p) => p.claimed).length} odebranych</Badge>
              <Badge variant="brass">
                {game.players.filter((p) => p.hasClaimToken && !p.claimed).length} czeka na odbiór
              </Badge>
            </div>
          </Surface>
        </div>

        {/* Operational queue */}
        {actions.length > 0 && (
          <Surface variant="system" className="xl:col-span-2">
            <p className="eyebrow">Kolejka operacyjna</p>
            {unresolved.length === 0 && (
              <p className="mt-2 text-sm text-success">Wszystkie akcje rozstrzygnięte.</p>
            )}
            <ol className="mt-3 flex flex-col gap-2">
              {actions.map((action) => {
                const isActive = action.id === waitingForStoryteller?.id || action.id === waitingForPlayer?.id;
                const isResolved = action.status === "RESOLVED";
                return (
                  <li
                    key={action.id}
                    className={
                      isActive
                        ? "rounded-tile border border-brass bg-brass/10 p-3"
                        : "rounded-tile border border-line bg-card-soft/60 p-3"
                    }
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                        {action.orderIndex + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base text-ink-primary">
                          {characterDisplayName(
                            STEP_CHARACTER[action.kind as StepKind] ?? action.kind,
                          )}
                        </p>
                        <p className="truncate text-meta text-ink-muted">
                          {action.actorDisplayName ?? "—"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          isResolved
                            ? "success"
                            : isActive
                              ? "brass"
                              : "neutral"
                        }
                      >
                        {isResolved
                          ? "rozstrzygnięto"
                          : isActive
                            ? action.status === "WAITING_FOR_PLAYER"
                              ? "czeka na gracza"
                              : "czeka na Ciebie"
                            : "w kolejce"}
                      </Badge>
                    </div>
                    {isResolved && action.resolutionJson != null && (
                      <p className="mt-1 pl-11 text-meta text-ink-muted">
                        {privacyCovered ? "▮▮▮" : resolutionText(action.resolutionJson, nameById)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </Surface>
        )}

        {/* Nominations */}
        <Surface variant={game.nominations.some((n) => n.status === "VOTING") ? "formal" : "system"} className={actions.length === 0 ? "xl:col-span-2" : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">Nominacje</p>
            {game.investigation?.nominationState === "OPEN" && (
              <Button variant="quiet" size="sm" disabled={busy || gameEnded} onClick={onCloseNominations}>
                Zamknij
              </Button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant={candidateId ? "rust" : "neutral"}>
              {candidateName
                ? `kandydat: ${candidateName} (${game.investigation?.currentHighEffectiveVotes ?? 0} głosów)`
                : "brak kandydata"}
            </Badge>
            <Badge variant="neutral">
              stan: {game.investigation ? (game.investigation.nominationState === "OPEN" ? "otwarte" : "zamknięte") : "—"}
            </Badge>
          </div>

          {game.nominations.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Brak nominacji.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {game.nominations.map((n) => {
                const locked = n.status === "LOCKED" || n.status === "RESOLVED";
                return (
                  <li key={n.id} className="rounded-tile border border-line bg-card-soft/60 p-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-sm text-ink-primary">
                        {n.nominatorName ?? "—"} → {n.nomineeName ?? "—"}
                      </span>
                      <Badge variant={locked ? (n.qualified ? "success" : "neutral") : "brass"}>
                        {nominationStatusLabel(n.status)}
                      </Badge>
                      {locked && (
                        <span className="text-meta tabular-nums text-ink-muted">
                          {n.effectiveTotal} głosów {n.qualified ? "· kandydat" : "· nie przeszedł"}
                        </span>
                      )}
                    </div>

                    {n.status === "VOTING" && n.passStatus === "RUNNING" && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm text-ink-secondary">
                          Głosuje:{" "}
                          <span className="text-ink-primary">
                            {n.currentVirtualSeat != null
                              ? (sortedPlayers.find((p) => p.virtualSeat === n.currentVirtualSeat)?.displayName ??
                                `miejsce ${n.currentVirtualSeat + 1}`)
                              : "—"}
                          </span>
                        </span>
                        <Button variant="quiet" size="sm" disabled={busy || gameEnded} onClick={() => onAdvanceVoting(n.id)}>
                          Dalej
                        </Button>
                      </div>
                    )}
                    {n.status === "VOTING" && n.passStatus === "COMPLETE" && (
                      <div className="mt-2">
                        <Button variant="formal" size="sm" disabled={busy || gameEnded} onClick={() => onLockVote(n.id)}>
                          Zablokuj głosowanie
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {travellers.length > 0 && (
            <div className="mt-3 rounded-tile border border-line bg-card-soft/60 p-3">
              <p className="eyebrow mb-2">Podróżni</p>
              <ul className="flex flex-col gap-2">
                {travellers.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-ink-primary">{p.displayName}</span>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy || gameEnded}
                      onClick={() =>
                        openConfirm(
                          "Wygnaj podróżnego",
                          `${p.displayName} opuszcza krąg. Ta operacja jest trudna do cofnięcia.`,
                          () => onExileTraveller(p.id),
                          "danger",
                        )
                      }
                    >
                      Wygnaj
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Surface>

        {/* Scenario pulse */}
        <Surface variant="system">
          <p className="eyebrow">Scenariusz</p>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <MapIcon aria-hidden="true" className="h-4 w-4 text-ink-muted" />
              <span className="text-ink-secondary">Mapa:</span>
              <span className="text-ink-primary">{mapVersionLabel(scenario?.mapVersionId ?? null)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ScanLine aria-hidden="true" className="h-4 w-4 text-ink-muted" />
              <span className="text-ink-secondary">Ostatnie skanowanie:</span>
              <span className="text-ink-primary">
                {lastScan ? `${lastScan.playerName ?? lastScan.playerId} · ${lastScan.qrTokenId}` : "—"}
              </span>
            </div>
            {scenario && scenario.tasks.some((t) => t.state !== "COMPLETED") && (
              <div className="flex items-center gap-2 text-sm">
                <ListChecks aria-hidden="true" className="h-4 w-4 text-ink-muted" />
                <span className="text-ink-primary">
                  {scenario.tasks.filter((t) => t.state !== "COMPLETED").length} zadań otwartych
                </span>
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            className="mt-3"
            icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
            onClick={() => onNavigate("scenario")}
          >
            Otwórz scenariusz
          </Button>
        </Surface>
      </div>

      {/* Confirmation dialog for irreversible phase actions */}
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirm(null)}>
              Anuluj
            </Button>
            <Button
              variant={confirm?.variant ?? "formal"}
              busy={busy}
              onClick={() => {
                const action = confirm?.action;
                setConfirm(null);
                action?.();
              }}
            >
              Zatwierdź
            </Button>
          </>
        }
      />
    </div>
  );
}
