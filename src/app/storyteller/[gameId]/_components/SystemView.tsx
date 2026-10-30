"use client";

// SystemView — the storyteller's control-plane utility screen (realtime,
// presence, checkpoints, diagnostics) plus the gated danger zone for state
// overrides. Purely presentational: all data and side effects come from the
// page controller via props.

import { useState } from "react";
import { Activity, HeartPulse, Lock, ShieldAlert, Unlock } from "lucide-react";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Notice from "@/components/ui/Notice";
import Skeleton from "@/components/ui/Skeleton";
import StatTile from "@/components/ui/StatTile";
import Surface from "@/components/ui/Surface";
import type {
  PresenceConnectionDto,
  StorytellerActionDto,
  StorytellerControlDto,
  StorytellerPlayerDto,
} from "@/lib/client-api";
import type { RealtimeHealth } from "@/components/useGameEventStream";

export type RecoveryKind =
  | "RESOLVE_ACTION"
  | "SKIP_ACTION"
  | "CORRECT_ALIVE"
  | "RESTORE_GHOST_VOTE";

const RECOVERY_KINDS: { id: RecoveryKind; label: string }[] = [
  { id: "RESOLVE_ACTION", label: "Rozwiąż akcję" },
  { id: "SKIP_ACTION", label: "Pomiń akcję" },
  { id: "CORRECT_ALIVE", label: "Popraw stan życia" },
  { id: "RESTORE_GHOST_VOTE", label: "Przywróć głos ducha" },
];

const REALTIME_STAT: Record<RealtimeHealth, { label: string; tone: BadgeVariant }> = {
  LIVE: { label: "LIVE", tone: "moss" },
  RECONNECTING: { label: "ŁĄCZENIE…", tone: "brass" },
  OFFLINE: { label: "OFFLINE", tone: "danger" },
};

const PRESENCE_BADGE: Record<PresenceConnectionDto, { variant: BadgeVariant; label: string }> = {
  ONLINE: { variant: "success", label: "ONLINE" },
  STALE: { variant: "brass", label: "STALE" },
  OFFLINE: { variant: "neutral", label: "OFFLINE" },
};

function kindLabel(kind: RecoveryKind): string {
  return RECOVERY_KINDS.find((option) => option.id === kind)?.label ?? kind;
}

function needsPlayer(kind: RecoveryKind): boolean {
  return kind === "CORRECT_ALIVE" || kind === "RESTORE_GHOST_VOTE";
}

export interface SystemViewProps {
  control: StorytellerControlDto | null; // null while loading
  nameById: Map<string, string>; // playerId -> displayName
  realtime: RealtimeHealth; // "LIVE" | "RECONNECTING" | "OFFLINE"
  players: StorytellerPlayerDto[]; // for the human-readable recovery target picker
  actions: StorytellerActionDto[]; // operational actions, for action pickers
  // checkpoint
  checkpointReason: string;
  onCheckpointReasonChange: (value: string) => void;
  onCreateCheckpoint: () => void;
  checkpointBusy: boolean;
  checkpointNote: string | null;
  // recovery (danger zone)
  recoveryKind: RecoveryKind;
  onRecoveryKindChange: (kind: RecoveryKind) => void;
  recoveryTargetId: string;
  onRecoveryTargetIdChange: (id: string) => void;
  recoveryAlive: boolean;
  onRecoveryAliveChange: (alive: boolean) => void;
  recoveryReason: string;
  onRecoveryReasonChange: (reason: string) => void;
  onSubmitRecovery: () => void;
  recoveryBusy: boolean;
  formatTime: (iso: string) => string;
}

export default function SystemView({
  control,
  nameById,
  realtime,
  players,
  actions,
  checkpointReason,
  onCheckpointReasonChange,
  onCreateCheckpoint,
  checkpointBusy,
  checkpointNote,
  recoveryKind,
  onRecoveryKindChange,
  recoveryTargetId,
  onRecoveryTargetIdChange,
  recoveryAlive,
  onRecoveryAliveChange,
  recoveryReason,
  onRecoveryReasonChange,
  onSubmitRecovery,
  recoveryBusy,
  formatTime,
}: SystemViewProps) {
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Raw-id fallback used only while the picker sits on its sentinel option. */
  const [advancedTarget, setAdvancedTarget] = useState("");

  const realtimeStat = REALTIME_STAT[realtime];
  const advancedActive = advancedTarget.trim() !== "";
  const effectiveTarget = advancedActive ? advancedTarget.trim() : recoveryTargetId;
  const selectValue = advancedActive ? "" : recoveryTargetId;
  const canSubmit = recoveryReason.trim() !== "" && effectiveTarget !== "";

  function handleKindChange(kind: RecoveryKind) {
    setAdvancedTarget("");
    onRecoveryKindChange(kind);
  }

  function handleSelectTarget(value: string) {
    setAdvancedTarget("");
    onRecoveryTargetIdChange(value);
  }

  function handleAdvancedTarget(value: string) {
    setAdvancedTarget(value);
    onRecoveryTargetIdChange(value);
  }

  /** Human-readable target for the confirmation summary. */
  function targetSummary(): string {
    if (!effectiveTarget) return "—";
    if (needsPlayer(recoveryKind)) {
      const player = players.find((p) => p.id === effectiveTarget);
      return player ? `${player.virtualSeat + 1} ${player.displayName}` : effectiveTarget;
    }
    const action = actions.find((a) => a.id === effectiveTarget);
    return action
      ? `${action.orderIndex + 1} ${action.kind} — ${action.actorDisplayName ?? "—"}`
      : effectiveTarget;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Czas rzeczywisty ------------------------------------------- */}
      <Surface variant="system">
        <p className="eyebrow">CZAS RZECZYWISTY</p>
        {!control ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton variant="stat" className="h-20" />
            <Skeleton variant="stat" className="h-20" />
            <Skeleton variant="stat" className="h-20" />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              label="połączenie"
              value={realtimeStat.label}
              tone={realtimeStat.tone}
              icon={Activity}
            />
            <StatTile label="status" value={control.status ?? "—"} icon={ShieldAlert} />
            <StatTile label="faza" value={control.phase ?? "—"} icon={HeartPulse} />
          </div>
        )}
      </Surface>

      {/* ---- Obecność ---------------------------------------------------- */}
      <Surface variant="system">
        <p className="eyebrow">OBECNOŚĆ</p>
        {!control ? (
          <Skeleton variant="list" className="mt-3" />
        ) : control.presence.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">brak połączeń</p>
        ) : (
          <Surface variant="soft" className="mt-3">
            <ul className="flex flex-col divide-y divide-line">
              {control.presence.map((p) => {
                const badge = PRESENCE_BADGE[p.connection];
                return (
                  <li
                    key={p.viewerId}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0 truncate text-sm text-ink-primary">
                      {p.playerId ? (nameById.get(p.playerId) ?? p.playerId) : "Storyteller"}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <span className="text-meta tabular-nums text-ink-muted">
                        {formatTime(p.lastSeenAt)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Surface>
        )}
      </Surface>

      {/* ---- Punkt kontrolny -------------------------------------------- */}
      <Surface variant="system">
        <p className="eyebrow">PUNKT KONTROLNY</p>
        {!control ? (
          <Skeleton variant="text" className="mt-2" />
        ) : control.latestCheckpoint ? (
          <p className="mt-2 text-sm text-ink-secondary">
            wersja{" "}
            <span className="tabular-nums">{control.latestCheckpoint.gameVersion}</span>
            {control.latestCheckpoint.reason && (
              <> · {control.latestCheckpoint.reason}</>
            )}
            <span className="text-ink-muted">
              {" "}
              · {formatTime(control.latestCheckpoint.createdAt)}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">brak</p>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-meta text-ink-muted">
              Powód (opcjonalnie)
            </span>
            <input
              value={checkpointReason}
              onChange={(e) => onCheckpointReasonChange(e.target.value)}
              placeholder="np. przed nocą 3"
              autoComplete="off"
              className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-base text-ink-primary placeholder:text-ink-muted"
            />
          </label>
          <Button variant="secondary" onClick={onCreateCheckpoint} busy={checkpointBusy}>
            Utwórz punkt kontrolny
          </Button>
        </div>
        {checkpointNote && (
          <Notice variant="success" className="mt-3">
            {checkpointNote}
          </Notice>
        )}
      </Surface>

      {/* ---- Diagnostyka -------------------------------------------------- */}
      <Surface variant="system">
        <p className="eyebrow">DIAGNOSTYKA</p>
        {!control ? (
          <Skeleton variant="text" className="mt-2" />
        ) : control.consistencyIssues.every((issue) => issue.ok) ? (
          <Notice variant="success" className="mt-3">
            Spójność OK
          </Notice>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {control.consistencyIssues
              .filter((issue) => !issue.ok)
              .map((issue) => (
                <Notice key={issue.check} variant="error">
                  <span className="font-medium">{issue.check}</span> — {issue.message}
                </Notice>
              ))}
          </div>
        )}
      </Surface>

      {/* ---- Strefa niebezpieczeństwa ------------------------------------- */}
      <div className="rounded-card border border-danger/40 bg-danger/5 p-4">
        <p className="eyebrow text-danger">STREFA NIEBEZPIECZEŃSTWA</p>
        <p className="mt-2 text-sm text-ink-secondary">
          Nadpisania stanu gry — wyłącznie w wyjątkowych sytuacjach.
        </p>
        <Button
          variant="danger"
          className="mt-3"
          onClick={() => setDangerOpen((open) => !open)}
          aria-expanded={dangerOpen}
          aria-controls="system-danger-zone-panel"
          icon={
            dangerOpen ? (
              <Unlock aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Lock aria-hidden="true" className="h-4 w-4" />
            )
          }
        >
          Wejdź
        </Button>

        {dangerOpen && (
          <div id="system-danger-zone-panel" className="mt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
              className="flex flex-col gap-3"
            >
              <label>
                <span className="mb-1 block text-meta text-ink-muted">
                  Rodzaj nadpisania
                </span>
                <select
                  value={recoveryKind}
                  onChange={(e) => handleKindChange(e.target.value as RecoveryKind)}
                  className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-base text-ink-primary"
                >
                  {RECOVERY_KINDS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-meta text-ink-muted">
                  {needsPlayer(recoveryKind) ? "Gracz" : "Akcja"}
                </span>
                <select
                  value={selectValue}
                  onChange={(e) => handleSelectTarget(e.target.value)}
                  className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-base text-ink-primary"
                >
                  <option value="">— wybierz —</option>
                  {needsPlayer(recoveryKind)
                    ? players.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.virtualSeat + 1} {player.displayName}
                        </option>
                      ))
                    : actions.map((action) => (
                        <option key={action.id} value={action.id}>
                          {action.orderIndex + 1} {action.kind} —{" "}
                          {action.actorDisplayName ?? "—"}
                        </option>
                      ))}
                </select>
              </label>

              <details>
                <summary className="flex min-h-11 cursor-pointer items-center rounded-control px-2 text-meta text-ink-secondary hover:text-ink-primary">
                  Wpisz surowy identyfikator
                </summary>
                <input
                  value={advancedTarget}
                  onChange={(e) => handleAdvancedTarget(e.target.value)}
                  placeholder="id"
                  autoComplete="off"
                  className="mt-2 min-h-11 w-full rounded-control border border-line bg-card-soft px-3 font-mono text-sm text-ink-primary placeholder:text-ink-muted"
                />
              </details>

              {recoveryKind === "CORRECT_ALIVE" && (
                <label>
                  <span className="mb-1 block text-meta text-ink-muted">
                    Stan życia
                  </span>
                  <select
                    value={recoveryAlive ? "true" : "false"}
                    onChange={(e) => onRecoveryAliveChange(e.target.value === "true")}
                    className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-base text-ink-primary"
                  >
                    <option value="true">żyje</option>
                    <option value="false">nie żyje</option>
                  </select>
                </label>
              )}

              <label>
                <span className="mb-1 block text-meta text-ink-muted">
                  Powód (wymagany)
                </span>
                <input
                  value={recoveryReason}
                  onChange={(e) => onRecoveryReasonChange(e.target.value)}
                  placeholder="Dlaczego nadpisujesz stan?"
                  autoComplete="off"
                  className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 text-base text-ink-primary placeholder:text-ink-muted"
                />
              </label>

              <Button
                type="submit"
                variant="danger"
                fullWidth
                disabled={!canSubmit}
                busy={recoveryBusy}
              >
                Wykonaj nadpisanie
              </Button>
            </form>
          </div>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Wykonaj nadpisanie"
        description={
          <>
            {kindLabel(recoveryKind)} · {targetSummary()}.
            <br />
            Ten krok zmienia stan gry i zostanie zapisany w audycie.
          </>
        }
        footer={
          <>
            <Button variant="quiet" onClick={() => setConfirmOpen(false)}>
              Anuluj
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmOpen(false);
                setAdvancedTarget("");
                onSubmitRecovery();
              }}
            >
              Wykonaj
            </Button>
          </>
        }
      />
    </div>
  );
}
