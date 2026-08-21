"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  api,
  ApiClientError,
  friendlyMessage,
  type AccessResetResponseDto,
  type CheckpointResponseDto,
  type InfoResultDto,
  type StorytellerActionDto,
  type StorytellerAuditDto,
  type StorytellerControlDto,
  type StorytellerGameProjection,
  type StorytellerPlayerDto,
  type StorytellerResolutionDto,
} from "@/lib/client-api";
import ActionDecisionPanel from "@/components/ActionDecisionPanel";
import PhaseBadge from "@/components/PhaseBadge";

const MIN_READY = 13;
const MAX_PLAYERS = 16;

/** Scenario definition fixture ids (docs/08) — ST-only override menu. */
const CLUE_OPTIONS = [
  { id: "clue-letter", label: "clue-letter — List milionera" },
  { id: "clue-map", label: "clue-map — Aneks do mapy" },
  { id: "clue-finale", label: "clue-finale — Zniknięcie" },
];

const MAP_OPTIONS = [
  { id: "MAP_BASE", label: "Mapa główna" },
  { id: "MAP_EXTENDED", label: "Mapa rozszerzona" },
];

type RecoveryKind = "RESOLVE_ACTION" | "SKIP_ACTION" | "CORRECT_ALIVE" | "RESTORE_GHOST_VOTE";

const RECOVERY_KINDS: { id: RecoveryKind; label: string }[] = [
  { id: "RESOLVE_ACTION", label: "Rozwiąż akcję" },
  { id: "SKIP_ACTION", label: "Pomiń akcję" },
  { id: "CORRECT_ALIVE", label: "Popraw stan życia" },
  { id: "RESTORE_GHOST_VOTE", label: "Przywróć głos widma" },
];

/** "2026-08-20T18:04:00Z" → "20.08, 18:04" (local). */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapVersionLabel(mapVersionId: string | null): string {
  if (mapVersionId === "MAP_EXTENDED") return "Mapa rozszerzona";
  if (mapVersionId === "MAP_BASE") return "Mapa główna";
  return "—";
}

function taskStateLabel(state: string): string {
  return state === "COMPLETED" ? "ukończono" : "do zrobienia";
}

function statusLabel(status: string): string {
  if (status === "LOBBY") return "Poczekalnia";
  if (status === "SETUP") return "Konfiguracja";
  return status;
}

function claimStatus(player: StorytellerPlayerDto): { label: string; className: string } {
  if (player.claimed) return { label: "odebrano", className: "text-success" };
  if (player.hasClaimToken) return { label: "link wydany, nieodebrany", className: "text-brass" };
  return { label: "brak linku", className: "text-ink-muted" };
}

/** "WASHERWOMAN" → "Washerwoman", "FORTUNE_TELLER" → "Fortune Teller". */
function titleCaseCharacterId(id: string): string {
  return id
    .split("_")
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

function alignmentLabel(alignment: string): string {
  return alignment === "EVIL" ? "Zło" : "Dobro";
}

function winnerLabel(winner: string | null): string {
  if (winner === "GOOD") return "Koniec gry — wygrywa dobro";
  if (winner === "EVIL") return "Koniec gry — wygrywa zło";
  return "";
}

function nominationStatusLabel(status: string): string {
  switch (status) {
    case "VOTING":
      return "głosowanie";
    case "LOCKED":
      return "zablokowano";
    case "RESOLVED":
      return "rozstrzygnięto";
    case "CREATED":
      return "utworzono";
    case "DAY_TRIGGER_RESOLUTION":
      return "wymagana decyzja rejestracji";
    default:
      return status;
  }
}

/** Polish labels for the bounded registration option descriptions (spec 18). */
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

function isInfoResult(result: unknown): result is InfoResultDto {
  if (typeof result !== "object" || result === null) return false;
  return "kind" in result && typeof (result as { kind?: unknown }).kind === "string";
}

/** Readable text for a resolved secret (InfoResult or `{ targetPlayerIds }`). */
function resolutionText(result: unknown, nameById: Map<string, string>): string {
  if (isInfoResult(result)) {
    switch (result.kind) {
      case "CHARACTER_CANDIDATES":
        return `${titleCaseCharacterId(result.characterId)}: ${result.candidatePlayerIds
          .map((id) => nameById.get(id) ?? id)
          .join(", ")}`;
      case "CHARACTER":
        return `${titleCaseCharacterId(result.characterId)} — ${nameById.get(result.playerId) ?? result.playerId}`;
      case "NUMBER":
        return `Liczba: ${result.value}`;
      case "NO_OUTSIDERS":
        return "brak outsiderów";
      case "DEMON_YES_NO":
        return result.value ? "Tak" : "Nie";
      case "GRIMOIRE":
        return `Pełna lista ról (${result.assignments.length})`;
      default:
        return "—";
    }
  }
  if (result && typeof result === "object" && "targetPlayerIds" in result) {
    const ids = (result as { targetPlayerIds?: string[] }).targetPlayerIds ?? [];
    return `Wybrani: ${ids.map((id) => nameById.get(id) ?? id).join(", ")}`;
  }
  return "—";
}

interface ClaimTokenResponse {
  playerId: string;
  claimId: string;
  expiresAt: string;
  claimToken?: string;
  duplicate?: boolean;
  version: number;
}

export default function StorytellerDashboard() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId;

  const [game, setGame] = useState<StorytellerGameProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [claimModal, setClaimModal] = useState<{
    player: StorytellerPlayerDto;
    link: string | null;
    busy: boolean;
    error: string | null;
  } | null>(null);

  const [renamingGame, setRenamingGame] = useState(false);
  const [gameNameDraft, setGameNameDraft] = useState("");

  const [revealClueId, setRevealClueId] = useState("clue-letter");
  const [revealTargetPlayerId, setRevealTargetPlayerId] = useState("");
  const [stageInput, setStageInput] = useState("");

  const [control, setControl] = useState<StorytellerControlDto | null>(null);
  const [audit, setAudit] = useState<StorytellerAuditDto | null>(null);

  const [checkpointReason, setCheckpointReason] = useState("");
  const [checkpointNote, setCheckpointNote] = useState<string | null>(null);

  /** One-shot crisp confirmation after a vote lock succeeds (docs/11 §13). */
  const [lockConfirm, setLockConfirm] = useState(false);
  const lockConfirmTimerRef = useRef<number | null>(null);

  const [recoveryKind, setRecoveryKind] = useState<RecoveryKind>("RESOLVE_ACTION");
  const [recoveryTargetId, setRecoveryTargetId] = useState("");
  const [recoveryAlive, setRecoveryAlive] = useState(true);
  const [recoveryReason, setRecoveryReason] = useState("");

  const [resetModal, setResetModal] = useState<{
    player: StorytellerPlayerDto;
    token: string | null;
    busy: boolean;
    error: string | null;
  } | null>(null);

  /** Control plane projections (Slice 6) — refreshed alongside the main load. */
  const loadAux = useCallback(async () => {
    try {
      const [controlRes, auditRes] = await Promise.all([
        api<StorytellerControlDto>(`/api/v1/games/${gameId}/storyteller/control`),
        api<StorytellerAuditDto>(`/api/v1/games/${gameId}/storyteller/audit`),
      ]);
      setControl(controlRes);
      setAudit(auditRes);
    } catch {
      // Keep the previous snapshot; the control cards are non-critical.
    }
  }, [gameId]);

  const load = useCallback(async () => {
    try {
      const next = await api<StorytellerGameProjection>(`/api/v1/games/${gameId}/storyteller`);
      setGame(next);
      setFatalError(null);
      setStale(false);
      void loadAux();
    } catch (err) {
      const e = err as ApiClientError;
      setFatalError(friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się wczytać tej sprawy."));
    } finally {
      setLoading(false);
    }
  }, [gameId, loadAux]);

  useEffect(() => {
    void load();
  }, [load]);

  // Clear the vote-lock confirmation timer on unmount.
  useEffect(() => {
    return () => {
      if (lockConfirmTimerRef.current !== null) {
        window.clearTimeout(lockConfirmTimerRef.current);
      }
    };
  }, []);

  async function runMutation(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    setStale(false);
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === "VERSION_CONFLICT") {
        await load();
        setStale(true);
      } else {
        setActionError(friendlyMessage(e.code ?? "UNKNOWN", "Coś poszło nie tak."));
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Like `runMutation`, but returns the endpoint's response body when it succeeds. */
  async function runWithResult<T>(
    action: () => Promise<T>,
  ): Promise<{ ok: boolean; value: T | null }> {
    setBusy(true);
    setActionError(null);
    setStale(false);
    try {
      const value = await action();
      await load();
      return { ok: true, value };
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === "VERSION_CONFLICT") {
        await load();
        setStale(true);
      } else {
        setActionError(friendlyMessage(e.code ?? "UNKNOWN", "Coś poszło nie tak."));
      }
      return { ok: false, value: null };
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || !game) return;
    const ok = await runMutation(() =>
      api(`/api/v1/games/${gameId}/players`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { displayName: trimmed },
        }),
      }),
    );
    if (ok) setNewName("");
  }

  function startRename(player: StorytellerPlayerDto) {
    setEditingId(player.id);
    setEditingName(player.displayName);
  }

  async function commitRename(playerId: string) {
    const trimmed = editingName.trim();
    if (!trimmed || !game) return;
    const ok = await runMutation(() =>
      api(`/api/v1/games/${gameId}/players/${playerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { displayName: trimmed },
        }),
      }),
    );
    if (ok) {
      setEditingId(null);
      setEditingName("");
    }
  }

  async function handleRemove(player: StorytellerPlayerDto) {
    if (!game) return;
    const confirmed = window.confirm(`Usunąć gracza ${player.displayName} z kręgu?`);
    if (!confirmed) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/players/${player.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
        }),
      }),
    );
  }

  async function handleMove(playerId: string, direction: -1 | 1) {
    if (!game) return;
    const sorted = [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat);
    const index = sorted.findIndex((p) => p.id === playerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sorted.length) return;

    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    await runMutation(() =>
      api(`/api/v1/games/${gameId}/players/reorder`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { orderedPlayerIds: reordered.map((p) => p.id) },
        }),
      }),
    );
  }

  async function issueClaim(player: StorytellerPlayerDto) {
    if (!game) return;
    try {
      const res = await api<ClaimTokenResponse>(
        `/api/v1/games/${gameId}/players/${player.id}/claim-token`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            expectedVersion: game.version,
          }),
        },
      );
      if (res.claimToken) {
        setClaimModal({
          player,
          link: `${window.location.origin}/claim#${res.claimToken}`,
          busy: false,
          error: null,
        });
      } else {
        setClaimModal({
          player,
          link: null,
          busy: false,
          error: "Dla tego gracza wydano już link do odbioru.",
        });
      }
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === "VERSION_CONFLICT") {
        await load();
        setStale(true);
      }
      setClaimModal({
        player,
        link: null,
        busy: false,
        error: friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się wydać linku do odbioru."),
      });
    }
  }

  function openClaim(player: StorytellerPlayerDto) {
    setClaimModal({ player, link: null, busy: true, error: null });
    void issueClaim(player);
  }

  async function handleGenerateSetup() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/setup/generate`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleCommitSetup() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/setup/commit`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleStartOperational() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/operational/start`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleResolveActionWithResolution(
    action: StorytellerActionDto,
    resolution: StorytellerResolutionDto | undefined,
  ) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/storyteller/actions/${action.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: resolution ? { resolution } : {},
        }),
      }),
    );
  }

  async function handleRenameGame() {
    if (!game) return;
    const trimmed = gameNameDraft.trim();
    if (!trimmed) return;
    const ok = await runMutation(() =>
      api(`/api/v1/games/${gameId}`, {
        method: "PATCH",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { name: trimmed },
        }),
      }),
    );
    if (ok) {
      setRenamingGame(false);
      setGameNameDraft("");
    }
  }

  async function handleCompleteOperational() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/operational/complete`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleOpenNominations() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/investigation/nominations/open`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleCloseNominations() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/investigation/nominations/close`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleLockVote(nominationId: string) {
    if (!game) return;
    const ok = await runMutation(() =>
      api(`/api/v1/games/${gameId}/nominations/${nominationId}/votes/lock`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
    if (ok) {
      setLockConfirm(true);
      if (lockConfirmTimerRef.current !== null) {
        window.clearTimeout(lockConfirmTimerRef.current);
      }
      lockConfirmTimerRef.current = window.setTimeout(() => setLockConfirm(false), 2200);
    }
  }

  async function handleStartVoting(nominationId: string) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/nominations/${nominationId}/voting/start`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleAdvanceVoting(nominationId: string) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/nominations/${nominationId}/voting/advance`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleResolveTrigger(nominationId: string, optionId: string) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/nominations/${nominationId}/triggers/resolve`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { optionId },
        }),
      }),
    );
  }

  async function handleResolveExecution() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/investigation/resolve-execution`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleCloseInvestigation() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/investigation/close`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleExileTraveller(playerId: string) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/traveller/exile`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { playerId },
        }),
      }),
    );
  }

  async function handleScenarioRevealClue() {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/storyteller/scenario/clues/${revealClueId}/reveal`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: revealTargetPlayerId ? { targetPlayerId: revealTargetPlayerId } : {},
        }),
      }),
    );
  }

  async function handleScenarioCompleteTask(taskId: string) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/storyteller/scenario/tasks/${taskId}/complete`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleScenarioSetStage() {
    if (!game || !stageInput.trim()) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/storyteller/scenario/stage`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { stageId: stageInput.trim() },
        }),
      }),
    );
  }

  async function handleScenarioSetMap(mapVersionId: string) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/storyteller/scenario/map`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { mapVersionId },
        }),
      }),
    );
  }

  async function handleScenarioSetCondition(conditionId: string, active: boolean) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/storyteller/scenario/conditions`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { conditionId, active },
        }),
      }),
    );
  }

  /** Prefill the override target from the current blocking action. */
  useEffect(() => {
    const blocking = control?.blockingAction ?? null;
    if (!blocking) return;
    const needsPlayer = recoveryKind === "CORRECT_ALIVE" || recoveryKind === "RESTORE_GHOST_VOTE";
    setRecoveryTargetId(needsPlayer ? (blocking.actorPlayerId ?? "") : blocking.id);
  }, [control, recoveryKind]);

  async function handleCreateCheckpoint() {
    if (!game) return;
    setCheckpointNote(null);
    const reason = checkpointReason.trim();
    const res = await runWithResult<CheckpointResponseDto>(() =>
      api(`/api/v1/games/${gameId}/storyteller/checkpoints`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: reason ? { reason } : {},
        }),
      }),
    );
    if (res.ok) {
      setCheckpointReason("");
      setCheckpointNote(
        res.value?.valid === false
          ? "Punkt kontrolny utworzony — UWAGA: stan niespójny."
          : "Punkt kontrolny utworzony — stan spójny.",
      );
    }
  }

  async function handleRecoveryOverride() {
    if (!game) return;
    const reason = recoveryReason.trim();
    if (!reason) return;
    const target = recoveryTargetId.trim() || undefined;
    const payload =
      recoveryKind === "CORRECT_ALIVE"
        ? { kind: recoveryKind, playerId: target, alive: recoveryAlive, reason }
        : recoveryKind === "RESTORE_GHOST_VOTE"
          ? { kind: recoveryKind, playerId: target, reason }
          : { kind: recoveryKind, actionId: target, reason };
    const ok = await runMutation(() =>
      api(`/api/v1/games/${gameId}/storyteller/recovery/override`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version, payload }),
      }),
    );
    if (ok) {
      setRecoveryReason("");
      setRecoveryTargetId("");
    }
  }

  async function resetPlayerAccess(player: StorytellerPlayerDto) {
    if (!game) return;
    try {
      const res = await api<AccessResetResponseDto>(
        `/api/v1/games/${gameId}/players/${player.id}/access/reset`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            expectedVersion: game.version,
          }),
        },
      );
      setResetModal({ player, token: res.claimToken, busy: false, error: null });
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === "VERSION_CONFLICT") {
        await load();
        setStale(true);
      }
      setResetModal({
        player,
        token: null,
        busy: false,
        error: friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się zresetować dostępu."),
      });
    }
  }

  function openResetAccess(player: StorytellerPlayerDto) {
    setResetModal({ player, token: null, busy: true, error: null });
    void resetPlayerAccess(player);
  }

  const sorted = game ? [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat) : [];
  const ready = game?.isReady ?? false;
  const need = game ? Math.max(0, MIN_READY - game.participantCount) : 0;
  const renameEnabled = game ? game.status === "LOBBY" || game.status === "SETUP" : false;
  const gateText = ready
    ? "Gotowe do konfiguracji"
    : `Dodaj jeszcze ${need} ${need === 1 ? "uczestnika" : "uczestników"}`;
  const gateClassName = ready
    ? "border-success/40 bg-success/10 text-success"
    : "border-brass/40 bg-brass/10 text-brass";

  const setup = game?.setup ?? null;
  const setupCommitted = setup?.committed ?? false;
  const candidate = setup?.candidate ?? null;
  const grimoireAssignments = candidate
    ? [...candidate.assignments].sort((a, b) => a.virtualSeat - b.virtualSeat)
    : [];
  const operational = game?.operational ?? null;
  const nameById = new Map((game?.players ?? []).map((p) => [p.id, p.displayName]));
  const activeAction =
    operational?.actions.find(
      (a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER",
    ) ?? null;
  const unresolvedCount =
    operational?.actions.filter((a) => a.status !== "RESOLVED").length ?? 0;
  const operationalCardVisible = game ? game.status === "ROLE_REVEAL" || game.status === "ACTIVE" : false;

  const investigation = game?.investigation ?? null;
  const investigationVisible = game ? game.phase === "INVESTIGATION" : false;
  const gameEnded = game?.status === "ENDED";
  const candidateId = investigation?.currentExecutionCandidatePlayerId ?? null;
  const candidateName = candidateId ? (nameById.get(candidateId) ?? candidateId) : null;
  const travellers = game ? game.players.filter((p) => p.participantKind === "TRAVELLER" && p.alive) : [];

  const scenario = game?.scenario ?? null;
  const availableTasks = scenario ? scenario.tasks.filter((t) => t.state !== "COMPLETED") : [];
  const injured = scenario?.conditions.includes("INJURED") ?? false;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="display text-sm tracking-[0.3em] text-moss">
            The Sieś Files
          </Link>
          <span className="text-xs text-ink-muted">Storyteller</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {loading && !game && (
          <p className="py-12 text-center text-ink-muted">Wczytuję akta sprawy…</p>
        )}

        {!loading && fatalError && !game && (
          <div className="card critical-card mx-auto max-w-md text-center">
            <p className="text-danger">{fatalError}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass hover:bg-brass/20"
            >
              Spróbuj ponownie
            </button>
          </div>
        )}

        {game && (
          <>
            {(stale || actionError) && (
              <div className="mb-4 flex flex-col gap-2">
                {stale && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brass/40 bg-brass/10 px-4 py-3 text-sm text-brass"
                  >
                    <span>Ta sprawa zmieniła się w innej karcie — widok został odświeżony. Ponów ostatnią akcję.</span>
                    <button
                      type="button"
                      onClick={() => setStale(false)}
                      className="min-h-11 rounded-lg px-3 text-brass underline-offset-2 hover:underline"
                    >
                      Zamknij
                    </button>
                  </div>
                )}
                {actionError && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
                  >
                    <span>{actionError}</span>
                    <button
                      type="button"
                      onClick={() => setActionError(null)}
                      className="min-h-11 rounded-lg px-3 text-danger underline-offset-2 hover:underline"
                    >
                      Zamknij
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
              {/* Persistent terminal result (authoritative, survives reload) */}
              {game.result && (
                <section
                  className={`card md:col-span-6 ${
                    game.result.winner === "EVIL"
                      ? "border-danger/40 bg-danger/10"
                      : "border-success/40 bg-success/10"
                  }`}
                >
                  <p className="display text-xs tracking-[0.25em] text-ink-muted">Wynik sprawy</p>
                  <h2 className="display mt-1 text-2xl leading-tight text-ink-primary">
                    {winnerLabel(game.result.winner)}
                  </h2>
                  {game.result.reason && (
                    <p className="mt-1 text-sm text-ink-secondary">{game.result.reason}</p>
                  )}
                </section>
              )}

              {/* Header card */}
              <section className="card md:col-span-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="display text-xs tracking-[0.25em] text-moss">Akta sprawy</p>
                    {renamingGame ? (
                      <div className="mt-2 flex max-w-md flex-wrap items-center gap-2">
                        <label htmlFor="game-name-input" className="sr-only">
                          Nowa nazwa sprawy
                        </label>
                        <input
                          id="game-name-input"
                          value={gameNameDraft}
                          onChange={(e) => setGameNameDraft(e.target.value)}
                          autoFocus
                          autoComplete="off"
                          className="min-h-11 w-full min-w-52 flex-1 rounded-xl border border-line bg-elevated px-3 text-base text-ink-primary"
                        />
                        <button
                          type="button"
                          onClick={handleRenameGame}
                          disabled={busy || !gameNameDraft.trim()}
                          className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass hover:bg-brass/20 disabled:opacity-50"
                        >
                          Zapisz
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingGame(false);
                            setGameNameDraft("");
                          }}
                          className="min-h-11 rounded-xl px-3 text-ink-muted hover:text-ink-primary"
                        >
                          Anuluj
                        </button>
                      </div>
                    ) : (
                      <h1 className="display mt-1 break-words text-2xl leading-tight text-ink-primary sm:text-3xl">
                        {game.name}
                      </h1>
                    )}
                    <p className="mt-1 text-sm text-ink-muted">
                      {statusLabel(game.status)} · {game.participantCount}{" "}
                      {game.participantCount === 1 ? "uczestnik" : "uczestników"}
                    </p>
                    {!renamingGame && (
                      <button
                        type="button"
                        onClick={() => {
                          setGameNameDraft(game.name);
                          setRenamingGame(true);
                        }}
                        disabled={!renameEnabled || busy}
                        title={
                          renameEnabled
                            ? "Zmień nazwę sprawy"
                            : "Nazwę można zmieniać tylko w poczekalni i konfiguracji."
                        }
                        className="mt-2 min-h-11 rounded-xl border border-line px-3 text-sm text-ink-secondary hover:border-brass/50 hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Zmień nazwę
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PhaseBadge phase={game.phase} status={game.status} />
                    <div className={`rounded-full border px-4 py-2 text-sm font-medium ${gateClassName}`}>
                      {gateText}
                    </div>
                  </div>
                </div>
              </section>

              {/* Add participant card */}
              <section className="card md:col-span-2">
                <p className="display text-xs tracking-[0.25em] text-moss">Dodaj uczestnika</p>
                <form onSubmit={handleAdd} className="mt-3 flex flex-col gap-2">
                  <label htmlFor="new-player-name" className="sr-only">
                    Imię uczestnika
                  </label>
                  <input
                    id="new-player-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Imię"
                    autoComplete="off"
                    className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                  >
                    Dodaj do kręgu
                  </button>
                </form>
                {game.participantCount >= MAX_PLAYERS && (
                  <p className="mt-2 text-xs text-ink-muted">Lista pełna — maksimum 16 uczestników.</p>
                )}
              </section>

              {/* Virtual Circle card */}
              <section className="card md:col-span-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="display text-xs tracking-[0.25em] text-moss">Wirtualny Krąg</p>
                  <span className="text-xs text-ink-muted">{game.participantCount} osób</span>
                </div>

                {sorted.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-ink-muted">
                    Nie ma jeszcze uczestników. Dodaj pierwsze imię, aby otworzyć krąg.
                  </p>
                ) : (
                  <ol className="mt-3 flex flex-col gap-2">
                    {sorted.map((player, index) => {
                      const tone = claimStatus(player);
                      const isEditing = editingId === player.id;
                      const isFirst = index === 0;
                      const isLast = index === sorted.length - 1;

                      return (
                        <li
                          key={player.id}
                          className="rounded-xl border border-line bg-card-soft/60 p-3"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                              {player.virtualSeat + 1}
                            </span>

                            {isEditing ? (
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                <input
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  aria-label={`Zmień imię: ${player.displayName}`}
                                  autoFocus
                                  className="min-h-11 w-full min-w-40 flex-1 rounded-lg border border-line bg-elevated px-3 text-ink-primary"
                                />
                                <button
                                  type="button"
                                  onClick={() => commitRename(player.id)}
                                  disabled={busy}
                                  className="min-h-11 rounded-lg border border-brass/40 bg-brass/10 px-3 text-brass hover:bg-brass/20 disabled:opacity-50"
                                >
                                  Zapisz
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="min-h-11 rounded-lg px-3 text-ink-muted hover:text-ink-primary"
                                >
                                  Anuluj
                                </button>
                              </div>
                            ) : (
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-base text-ink-primary">{player.displayName}</p>
                                <p className={`text-xs ${tone.className}`}>{tone.label}</p>
                              </div>
                            )}
                          </div>

                          {!isEditing && (
                            <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
                              <button
                                type="button"
                                onClick={() => startRename(player)}
                                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-secondary hover:border-brass/50 hover:text-ink-primary"
                              >
                                Zmień imię
                              </button>
                              <button
                                type="button"
                                onClick={() => openClaim(player)}
                                disabled={busy}
                                className="min-h-11 rounded-lg border border-brass/40 px-3 text-sm text-brass hover:bg-brass/10 disabled:opacity-50"
                              >
                                Link do odbioru
                              </button>
                              {(player.claimed || player.hasClaimToken) && (
                                <button
                                  type="button"
                                  onClick={() => openResetAccess(player)}
                                  disabled={busy}
                                  className="min-h-11 rounded-lg border border-danger/40 px-3 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                                >
                                  Reset dostępu
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleMove(player.id, -1)}
                                disabled={busy || isFirst}
                                aria-label={`Przenieś ${player.displayName} w górę`}
                                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-secondary hover:border-brass/50 hover:text-ink-primary disabled:opacity-40"
                              >
                                W górę
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMove(player.id, 1)}
                                disabled={busy || isLast}
                                aria-label={`Przenieś ${player.displayName} w dół`}
                                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-secondary hover:border-brass/50 hover:text-ink-primary disabled:opacity-40"
                              >
                                W dół
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemove(player)}
                                disabled={busy}
                                className="min-h-11 rounded-lg border border-danger/40 px-3 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                              >
                                Usuń
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              {/* Setup card */}
              {!setupCommitted ? (
                <section className="card md:col-span-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="display text-xs tracking-[0.25em] text-moss">Konfiguracja</p>
                    {setup && setup.regenerationIndex > 0 && (
                      <span className="text-xs text-ink-muted">układ {setup.regenerationIndex}</span>
                    )}
                  </div>

                  {!candidate ? (
                    <>
                      <p className="mt-3 text-sm text-ink-secondary">
                        {ready
                          ? "Krąg jest gotowy — wygeneruj tajny układ ról."
                          : "Uzupełnij krąg, aby wygenerować układ."}
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateSetup}
                        disabled={busy || !ready}
                        className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                      >
                        Wygeneruj układ
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-xs text-ink-muted">Grimuar — tajny układ ról</p>
                      <ol className="mt-3 flex flex-col gap-2">
                        {grimoireAssignments.map((a) => {
                          const isRedHerring = a.playerId === candidate.fortuneTellerRedHerringPlayerId;
                          const isDrunk = a.trueCharacterId === "DRUNK";
                          return (
                            <li
                              key={a.playerId}
                              className={`rounded-xl border p-3 ${
                                isRedHerring ? "border-rust bg-rust/10" : "border-line bg-card-soft/60"
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                                  {a.virtualSeat + 1}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-base text-ink-primary">
                                  {nameById.get(a.playerId) ?? a.playerId}
                                </span>
                                <span className="min-w-0 text-right text-sm text-ink-secondary">
                                  {titleCaseCharacterId(a.trueCharacterId)}
                                  {isDrunk && a.perceivedCharacterId !== a.trueCharacterId && (
                                    <span className="text-ink-muted">
                                      {" "}
                                      → {titleCaseCharacterId(a.perceivedCharacterId)}
                                    </span>
                                  )}
                                </span>
                                <span
                                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${
                                    a.trueAlignment === "EVIL"
                                      ? "border-danger/40 text-danger"
                                      : "border-success/40 text-success"
                                  }`}
                                >
                                  {alignmentLabel(a.trueAlignment)}
                                </span>
                              </div>
                              {isRedHerring && (
                                <p className="mt-1 pl-11 text-xs text-ink-secondary">czerwony śledź Wróżki</p>
                              )}
                            </li>
                          );
                        })}
                      </ol>

                      <div className="mt-4 rounded-xl border border-line bg-card-soft/60 p-3">
                        <p className="text-xs text-moss">Bluffy Demona</p>
                        <p className="mt-1 text-sm text-ink-secondary">
                          {candidate.demonBluffs.map(titleCaseCharacterId).join(", ")}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateSetup}
                          disabled={busy}
                          className="min-h-11 rounded-xl border border-line px-4 text-ink-secondary transition-colors hover:border-brass/50 hover:text-ink-primary disabled:opacity-50"
                        >
                          Przegeneruj
                        </button>
                        <button
                          type="button"
                          onClick={handleCommitSetup}
                          disabled={busy}
                          className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                        >
                          Zatwierdź układ
                        </button>
                      </div>
                    </>
                  )}
                </section>
              ) : (
                /* Compact confirmation strip — subordinate to the active
                   blocker once the setup is locked (docs/11 §6). */
                <section className="card md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="display text-xs tracking-[0.25em] text-moss">Konfiguracja</p>
                    <span className="rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs text-success">
                      zatwierdzono
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    Układ ról zatwierdzony i zablokowany.
                  </p>
                </section>
              )}

              {/* Operational card */}
              {operationalCardVisible && (
                <section className="card md:col-span-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="display text-xs tracking-[0.25em] text-moss">Faza operacyjna</p>
                    {operational && (
                      <span className="text-xs text-ink-muted">cykl {operational.cycleNumber}</span>
                    )}
                  </div>

                  {!operational ? (
                    game.status === "ROLE_REVEAL" ? (
                      <div className="mt-3">
                        <p className="text-sm text-ink-secondary">
                          Rozpocznij pierwszą noc — zbuduj kolejkę działań i roześlij informacje.
                        </p>
                        <button
                          type="button"
                          onClick={handleStartOperational}
                          disabled={busy}
                          className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                        >
                          Rozpocznij fazę operacyjną
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-ink-secondary">
                        Faza operacyjna zakończona — śledztwo w toku.
                      </p>
                    )
                  ) : (
                    <>
                      <ol className="mt-3 flex flex-col gap-2">
                        {operational.actions.map((action) => {
                          const isActive = action.id === activeAction?.id;
                          const isStoryteller = action.status === "WAITING_FOR_STORYTELLER";
                          const isWaitingPlayer = action.status === "WAITING_FOR_PLAYER";
                          const isResolved = action.status === "RESOLVED";
                          const isPending = action.status === "PENDING";
                          return (
                            <li
                              key={action.id}
                              className={`rounded-xl border p-3 ${
                                isActive
                                  ? "border-brass bg-brass/10"
                                  : "border-line bg-card-soft/60"
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                                  {action.orderIndex + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-base text-ink-primary">
                                    {titleCaseCharacterId(action.kind)}
                                  </p>
                                  <p className="truncate text-xs text-ink-muted">
                                    {action.actorDisplayName ?? "—"}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${
                                    isResolved
                                      ? "border-success/40 text-success"
                                      : isActive
                                        ? "border-brass/40 text-brass"
                                        : "border-line text-ink-muted"
                                  }`}
                                >
                                  {isResolved
                                    ? "rozstrzygnięto"
                                    : isPending
                                      ? "w kolejce"
                                      : isWaitingPlayer
                                        ? "czeka na gracza"
                                        : "czeka na Ciebie"}
                                </span>
                              </div>

                              {isStoryteller && (
                                <ActionDecisionPanel
                                  gameId={gameId}
                                  action={action}
                                  players={game.players}
                                  busy={busy}
                                  onSubmit={(resolution) =>
                                    void handleResolveActionWithResolution(action, resolution)
                                  }
                                />
                              )}

                              {isResolved && (
                                <p className="mt-1 pl-11 text-xs text-ink-muted">
                                  {resolutionText(action.resolutionJson, nameById)}
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ol>

                      <button
                        type="button"
                        onClick={handleCompleteOperational}
                        disabled={busy || unresolvedCount > 0}
                        className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                      >
                        Zakończ fazę operacyjną
                      </button>
                    </>
                  )}
                </section>
              )}

              {/* Investigation card */}
              {investigationVisible && (
                <section className="card md:col-span-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="display text-xs tracking-[0.25em] text-moss">Śledztwo</p>
                    {investigation && (
                      <span className="text-xs text-ink-muted">cykl {investigation.cycleNumber}</span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {investigation?.nominationState === "CLOSED" ? (
                      <button
                        type="button"
                        onClick={handleOpenNominations}
                        disabled={busy || gameEnded}
                        className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                      >
                        Otwórz nominacje
                      </button>
                    ) : investigation?.nominationState === "OPEN" ? (
                      <button
                        type="button"
                        onClick={handleCloseNominations}
                        disabled={busy || gameEnded}
                        className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                      >
                        Zamknij nominacje
                      </button>
                    ) : (
                      <span className="text-sm text-ink-muted">
                        stan: {investigation?.nominationState ?? "—"}
                      </span>
                    )}
                    {gameEnded && <span className="text-xs text-ink-muted">sprawa zakończona</span>}
                  </div>

                  <div className="mt-3 rounded-xl border border-line bg-card-soft/60 p-3">
                    <p className="text-xs text-moss">Kandydat do egzekucji</p>
                    {candidateId ? (
                      <p className="mt-1 text-base text-ink-primary">
                        {candidateName}{" "}
                        <span className="text-sm text-ink-muted">
                          ({investigation?.currentHighEffectiveVotes ?? 0} głosów)
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-ink-muted">Brak kandydata.</p>
                    )}
                  </div>

                  {game.nominations.length > 0 ? (
                    <ol className="mt-3 flex flex-col gap-2">
                      {game.nominations.map((n) => {
                        const locked = n.status === "LOCKED" || n.status === "RESOLVED";
                        const triggerPending = n.status === "DAY_TRIGGER_RESOLUTION";
                        const voting = n.status === "VOTING";
                        const currentVoter =
                          n.currentVirtualSeat != null
                            ? (sorted.find((p) => p.virtualSeat === n.currentVirtualSeat) ?? null)
                            : null;
                        return (
                          <li
                            key={n.id}
                            className="rounded-xl border border-line bg-card-soft/60 p-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                                {n.sequence + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-base text-ink-primary">
                                  {n.nominatorName ?? "—"} → {n.nomineeName ?? "—"}
                                </p>
                                <p className="text-xs text-ink-muted">
                                  {nominationStatusLabel(n.status)}
                                </p>
                              </div>
                              {locked && (
                                <span
                                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${
                                    n.qualified
                                      ? "border-success/40 text-success"
                                      : "border-line text-ink-muted"
                                  }`}
                                >
                                  {n.qualified ? "kandydat" : "nie przeszedł"} · {n.effectiveTotal}
                                </span>
                              )}
                            </div>

                            {triggerPending && n.decision && (
                              <div className="mt-2 rounded-xl border border-brass/40 bg-brass/10 p-3 pl-11 sm:pl-11">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
                                  Wymagana decyzja rejestracji
                                </p>
                                <p className="mt-1 text-xs text-ink-muted">
                                  Jak ma zarejestrować się nominujący ({n.nominatorName ?? "—"})?
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {n.decision.options.map((option) => (
                                    <button
                                      key={option.optionId}
                                      type="button"
                                      onClick={() => handleResolveTrigger(n.id, option.optionId)}
                                      disabled={busy || gameEnded}
                                      className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-sm text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                                    >
                                      {registrationOptionLabel(option.description)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {voting && n.passStatus === "READY" && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 pl-11">
                                <button
                                  type="button"
                                  onClick={() => handleStartVoting(n.id)}
                                  disabled={busy || gameEnded}
                                  className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                                >
                                  Rozpocznij głosowanie
                                </button>
                              </div>
                            )}

                            {voting && n.passStatus === "RUNNING" && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 pl-11">
                                <span className="text-sm text-ink-secondary">
                                  Głosuje:{" "}
                                  <span className="text-ink-primary">
                                    {currentVoter?.displayName ??
                                      (n.currentVirtualSeat != null
                                        ? `miejsce ${n.currentVirtualSeat + 1}`
                                        : "—")}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAdvanceVoting(n.id)}
                                  disabled={busy || gameEnded}
                                  className="min-h-11 rounded-xl border border-line px-4 text-ink-secondary transition-colors hover:border-brass/50 hover:text-ink-primary disabled:opacity-50"
                                >
                                  Dalej
                                </button>
                              </div>
                            )}

                            {voting && n.passStatus === "COMPLETE" && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 pl-11">
                                <span className="text-sm text-ink-muted">
                                  Głosowanie zakończone.
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleLockVote(n.id)}
                                  disabled={busy || gameEnded}
                                  className="min-h-11 rounded-xl border border-brass/40 px-4 text-brass transition-colors hover:bg-brass/10 disabled:opacity-50"
                                >
                                  Zablokuj głosowanie
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="mt-3 text-sm text-ink-muted">Brak nominacji.</p>
                  )}

                  {lockConfirm && (
                    <p
                      role="status"
                      className="lock-confirm mt-3 inline-flex min-h-11 items-center rounded-lg border border-success/40 bg-success/10 px-3 text-sm text-success"
                    >
                      Głosowanie zablokowane.
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleResolveExecution}
                      disabled={busy || gameEnded || !candidateId}
                      className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                    >
                      Wykonaj egzekucję
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseInvestigation}
                      disabled={busy || gameEnded}
                      className="min-h-11 rounded-xl border border-line px-5 text-ink-secondary transition-colors hover:border-brass/50 hover:text-ink-primary disabled:opacity-50"
                    >
                      Zamknij śledztwo
                    </button>
                  </div>

                  {travellers.length > 0 && (
                    <div className="mt-4 rounded-xl border border-line bg-card-soft/60 p-3">
                      <p className="text-xs text-moss">Podróżni</p>
                      <ul className="mt-2 flex flex-col gap-2">
                        {travellers.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-sm text-ink-primary">
                              {p.displayName}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleExileTraveller(p.id)}
                              disabled={busy || gameEnded}
                              className="min-h-11 shrink-0 rounded-lg border border-danger/40 px-3 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
                            >
                              Wygnaj
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {/* Scenario card */}
              {scenario && (
                <section className="card md:col-span-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="display text-xs tracking-[0.25em] text-moss">Scenariusz</p>
                    <span className="text-xs text-ink-muted">panel Mistrza Gry</span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {/* State */}
                    <div className="rounded-xl border border-line bg-card-soft/60 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Etap</p>
                      <p className="mt-1 text-base text-ink-primary">{scenario.stageId ?? "—"}</p>
                      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-ink-muted">Mapa</p>
                      <p className="mt-1 text-base text-ink-primary">
                        {mapVersionLabel(scenario.mapVersionId)}
                      </p>
                      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-ink-muted">Stany</p>
                      {scenario.conditions.length === 0 ? (
                        <p className="mt-1 text-sm text-ink-muted">brak</p>
                      ) : (
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {scenario.conditions.map((condition) => (
                            <li
                              key={condition}
                              className="rounded-full border border-rust/40 bg-rust/10 px-2.5 py-0.5 text-xs text-ink-primary"
                            >
                              {condition}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Clues */}
                    <div className="rounded-xl border border-line bg-card-soft/60 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Wskazówki</p>
                      {scenario.clues.length === 0 ? (
                        <p className="mt-1 text-sm text-ink-muted">Brak dowodów</p>
                      ) : (
                        <ol className="mt-2 flex flex-col gap-1.5">
                          {scenario.clues.map((clue) => (
                            <li key={clue.id} className="text-sm text-ink-secondary">
                              <span className="text-ink-primary">{clue.title}</span>
                              <span className="text-ink-muted"> · {clue.id}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>

                    {/* Tasks */}
                    <div className="rounded-xl border border-line bg-card-soft/60 p-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Zadania</p>
                      {scenario.tasks.length === 0 ? (
                        <p className="mt-1 text-sm text-ink-muted">Brak zadań</p>
                      ) : (
                        <ol className="mt-2 flex flex-col gap-1.5">
                          {scenario.tasks.map((task) => {
                            const done = task.state === "COMPLETED";
                            return (
                              <li key={task.id} className="text-sm text-ink-secondary">
                                <span className="text-ink-primary">{task.title}</span>
                                <span
                                  className={`ml-1 text-xs ${done ? "text-success" : "text-brass"}`}
                                >
                                  · {taskStateLabel(task.state)}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>

                    {/* Scans */}
                    <div className="rounded-xl border border-line bg-card-soft/60 p-3 md:col-span-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Skanowania</p>
                      {scenario.scans.length === 0 ? (
                        <p className="mt-1 text-sm text-ink-muted">brak</p>
                      ) : (
                        <ol className="mt-2 flex flex-col gap-1.5">
                          {scenario.scans.map((scan, index) => (
                            <li
                              key={`${scan.qrTokenId}-${scan.playerId}-${index}`}
                              className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary"
                            >
                              <span className="text-ink-primary">
                                {scan.playerName ?? scan.playerId}
                              </span>
                              <span className="rounded-full border border-line px-2 py-0.5 font-mono text-xs text-ink-muted">
                                {scan.qrTokenId}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>

                  {/* Override controls — visually distinct from role/nomination controls */}
                  <div className="mt-4 rounded-xl border border-dashed border-brass/40 bg-elevated/60 p-3">
                    <p className="display text-xs tracking-[0.25em] text-brass">
                      Nadpisania scenariusza
                    </p>

                    <div className="mt-3 flex flex-col gap-3">
                      {/* Reveal clue */}
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="min-w-40 flex-1">
                          <span className="mb-1 block text-xs text-ink-muted">Odsłoń wskazówkę</span>
                          <select
                            value={revealClueId}
                            onChange={(e) => setRevealClueId(e.target.value)}
                            className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary"
                          >
                            {CLUE_OPTIONS.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="min-w-40 flex-1">
                          <span className="mb-1 block text-xs text-ink-muted">
                            Dla gracza (opcjonalnie)
                          </span>
                          <select
                            value={revealTargetPlayerId}
                            onChange={(e) => setRevealTargetPlayerId(e.target.value)}
                            className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary"
                          >
                            <option value="">— wszyscy —</option>
                            {sorted.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={handleScenarioRevealClue}
                          disabled={busy}
                          className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                        >
                          Odsłoń
                        </button>
                      </div>

                      {/* Complete task */}
                      <div>
                        <p className="text-xs text-ink-muted">Ukończ zadanie</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {availableTasks.length === 0 ? (
                            <span className="text-sm text-ink-muted">Brak dostępnych zadań.</span>
                          ) : (
                            availableTasks.map((task) => (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => handleScenarioCompleteTask(task.id)}
                                disabled={busy}
                                className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                              >
                                Ukończ: {task.title}
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Set stage */}
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="min-w-40 flex-1">
                          <span className="mb-1 block text-xs text-ink-muted">Zmień etap</span>
                          <input
                            value={stageInput}
                            onChange={(e) => setStageInput(e.target.value)}
                            placeholder={scenario.stageId ?? "stage-finale"}
                            autoComplete="off"
                            className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 font-mono text-sm text-ink-primary placeholder:text-ink-muted"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleScenarioSetStage}
                          disabled={busy || !stageInput.trim()}
                          className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                        >
                          Ustaw etap
                        </button>
                      </div>

                      {/* Set map */}
                      <div>
                        <p className="text-xs text-ink-muted">Odblokuj mapę</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {MAP_OPTIONS.map((option) => {
                            const active = scenario.mapVersionId === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => handleScenarioSetMap(option.id)}
                                disabled={busy}
                                aria-pressed={active}
                                className={`min-h-11 rounded-xl border px-4 text-sm transition-colors disabled:opacity-50 ${
                                  active
                                    ? "border-brass bg-brass/15 text-brass"
                                    : "border-line text-ink-secondary hover:border-brass/40 hover:text-ink-primary"
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* INJURED condition toggle */}
                      <div>
                        <p className="text-xs text-ink-muted">Stan: INJURED</p>
                        <button
                          type="button"
                          onClick={() => handleScenarioSetCondition("INJURED", !injured)}
                          disabled={busy}
                          aria-pressed={injured}
                          className={`mt-1 min-h-11 rounded-xl border px-4 text-sm transition-colors disabled:opacity-50 ${
                            injured
                              ? "border-rust bg-rust/15 text-ink-primary"
                              : "border-line text-ink-secondary hover:border-rust/40 hover:text-ink-primary"
                          }`}
                        >
                          {injured ? "wyłącz" : "włącz"}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Control card (Slice 6) */}
              <section className="card md:col-span-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="display text-xs tracking-[0.25em] text-moss">Sterowanie</p>
                  <button
                    type="button"
                    onClick={() => void loadAux()}
                    disabled={busy}
                    className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink-secondary hover:border-brass/50 hover:text-ink-primary disabled:opacity-50"
                  >
                    Odśwież
                  </button>
                </div>

                {!control ? (
                  <p className="mt-3 text-sm text-ink-muted">Wczytuję panel sterowania…</p>
                ) : (
                  <>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-secondary">
                      <span>
                        <span className="text-ink-muted">status:</span> {control.status ?? "—"}
                      </span>
                      <span>
                        <span className="text-ink-muted">faza:</span> {control.phase ?? "—"}
                      </span>
                      <span>
                        <span className="text-ink-muted">cykl:</span> {control.cycleNumber}
                      </span>
                      <span>
                        <span className="text-ink-muted">wersja:</span>{" "}
                        <span className="tabular-nums">{control.version}</span>
                      </span>
                      <span>
                        <span className="text-ink-muted">uczestnicy:</span> {control.participantCount}
                      </span>
                    </div>

                    {control.blockingAction ? (
                      <div className="mt-3 rounded-xl border border-brass/40 bg-brass/10 p-3">
                        <p className="text-xs text-moss">Blokująca akcja</p>
                        <p className="mt-1 text-sm text-ink-primary">
                          {titleCaseCharacterId(control.blockingAction.kind)}{" "}
                          <span className="text-brass">· {control.blockingAction.status}</span>
                        </p>
                        {control.blockingAction.actorPlayerId && (
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {nameById.get(control.blockingAction.actorPlayerId) ??
                              control.blockingAction.actorPlayerId}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-ink-muted">Brak blokującej akcji.</p>
                    )}

                    <div className="mt-3 rounded-xl border border-line bg-card-soft/60 p-3">
                      <p className="text-xs text-moss">Ostatnie zdarzenie</p>
                      {control.lastEvent ? (
                        <p className="mt-1 text-sm text-ink-secondary">
                          <span className="tabular-nums">#{control.lastEvent.sequence}</span>{" "}
                          {control.lastEvent.eventType} · wersja {control.lastEvent.gameVersion}
                          <span className="text-ink-muted">
                            {" "}
                            · {formatTime(control.lastEvent.createdAt)}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-ink-muted">brak</p>
                      )}
                      <p className="mt-3 text-xs text-moss">Ostatni punkt kontrolny</p>
                      {control.latestCheckpoint ? (
                        <p className="mt-1 text-sm text-ink-secondary">
                          wersja {control.latestCheckpoint.gameVersion}
                          {control.latestCheckpoint.reason &&
                            ` · ${control.latestCheckpoint.reason}`}
                          <span className="text-ink-muted">
                            {" "}
                            · {formatTime(control.latestCheckpoint.createdAt)}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-ink-muted">brak</p>
                      )}
                    </div>

                    <div className="mt-3 rounded-xl border border-line bg-card-soft/60 p-3">
                      <p className="text-xs text-moss">Spójność</p>
                      {control.consistencyIssues.every((issue) => issue.ok) ? (
                        <p className="mt-1 text-sm text-success">Spójność OK</p>
                      ) : (
                        <ul className="mt-1 flex flex-col gap-1">
                          {control.consistencyIssues
                            .filter((issue) => !issue.ok)
                            .map((issue) => (
                              <li key={issue.check} className="text-sm text-danger">
                                {issue.check} — {issue.message}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <label className="min-w-40 flex-1">
                        <span className="mb-1 block text-xs text-ink-muted">Powód (opcjonalnie)</span>
                        <input
                          value={checkpointReason}
                          onChange={(e) => setCheckpointReason(e.target.value)}
                          placeholder="np. przed nocą 3"
                          autoComplete="off"
                          className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleCreateCheckpoint}
                        disabled={busy}
                        className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                      >
                        Utwórz punkt kontrolny
                      </button>
                    </div>
                    {checkpointNote && (
                      <p className="mt-2 text-xs text-ink-secondary">{checkpointNote}</p>
                    )}
                  </>
                )}
              </section>

              {/* Recovery card (Slice 6) */}
              <section className="card critical-card md:col-span-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="display text-xs tracking-[0.25em] text-moss">Odzyskiwanie</p>
                  <span className="text-xs text-ink-secondary">nadpisania stanu</span>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleRecoveryOverride();
                  }}
                  className="mt-3 flex flex-col gap-2"
                >
                  <label>
                    <span className="mb-1 block text-xs text-ink-muted">Rodzaj nadpisania</span>
                    <select
                      value={recoveryKind}
                      onChange={(e) => setRecoveryKind(e.target.value as RecoveryKind)}
                      className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary"
                    >
                      {RECOVERY_KINDS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1 block text-xs text-ink-muted">
                      {recoveryKind === "CORRECT_ALIVE" || recoveryKind === "RESTORE_GHOST_VOTE"
                        ? "Identyfikator gracza"
                        : "Identyfikator akcji"}
                    </span>
                    <input
                      value={recoveryTargetId}
                      onChange={(e) => setRecoveryTargetId(e.target.value)}
                      placeholder="id"
                      autoComplete="off"
                      className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 font-mono text-sm text-ink-primary placeholder:text-ink-muted"
                    />
                  </label>

                  {recoveryKind === "CORRECT_ALIVE" && (
                    <label>
                      <span className="mb-1 block text-xs text-ink-muted">Stan życia</span>
                      <select
                        value={recoveryAlive ? "true" : "false"}
                        onChange={(e) => setRecoveryAlive(e.target.value === "true")}
                        className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary"
                      >
                        <option value="true">żyje</option>
                        <option value="false">nie żyje</option>
                      </select>
                    </label>
                  )}

                  <label>
                    <span className="mb-1 block text-xs text-ink-muted">Powód (wymagany)</span>
                    <input
                      value={recoveryReason}
                      onChange={(e) => setRecoveryReason(e.target.value)}
                      placeholder="Dlaczego nadpisujesz stan?"
                      autoComplete="off"
                      className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={busy || !recoveryReason.trim()}
                    className="min-h-11 rounded-xl border border-rust/50 bg-rust/15 px-4 text-ink-primary transition-colors hover:bg-rust/25 disabled:opacity-50"
                  >
                    Wykonaj nadpisanie
                  </button>
                </form>
              </section>

              {/* Audit card (Slice 6) */}
              <section className="card md:col-span-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="display text-xs tracking-[0.25em] text-moss">Audyt</p>
                  {audit && (
                    <span className="text-xs text-ink-muted">{audit.events.length} zdarzeń</span>
                  )}
                </div>

                {!audit ? (
                  <p className="mt-3 text-sm text-ink-muted">Wczytuję dziennik zdarzeń…</p>
                ) : audit.events.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">Brak zdarzeń.</p>
                ) : (
                  <ol className="mt-3 flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
                    {audit.events.map((event) => (
                      <li
                        key={event.sequence}
                        className="flex flex-wrap items-baseline gap-x-3 rounded-lg px-2 py-1.5 text-sm odd:bg-card-soft/40"
                      >
                        <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-ink-muted">
                          #{event.sequence}
                        </span>
                        <span className="min-w-0 break-words text-ink-primary">{event.eventType}</span>
                        <span className="min-w-0 truncate text-xs text-ink-muted">
                          {event.actor ?? "—"}
                        </span>
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-muted">
                          {formatTime(event.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </main>

      {claimModal && (
        <ClaimModal
          playerName={claimModal.player.displayName}
          link={claimModal.link}
          busy={claimModal.busy}
          error={claimModal.error}
          onClose={() => setClaimModal(null)}
        />
      )}

      {resetModal && (
        <ResetAccessModal
          playerName={resetModal.player.displayName}
          token={resetModal.token}
          busy={resetModal.busy}
          error={resetModal.error}
          onClose={() => setResetModal(null)}
        />
      )}
    </div>
  );
}

function ClaimModal({
  playerName,
  link,
  busy,
  error,
  onClose,
}: {
  playerName: string;
  link: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!link) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [link, onClose]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const field = document.getElementById("claim-link-field") as HTMLInputElement | null;
      if (field) {
        field.focus();
        field.select();
        try {
          document.execCommand("copy");
        } catch {
          // Manual copy still available via the selected text.
        }
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Link do odbioru dla: ${playerName}`}
        className="card w-full max-w-md bg-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="display text-xs tracking-[0.25em] text-moss">Link do odbioru</p>
            <h2 className="mt-1 break-words text-lg text-ink-primary">{playerName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 rounded-lg px-3 text-ink-muted hover:text-ink-primary"
          >
            Zamknij
          </button>
        </div>

        {busy && <p className="mt-4 text-sm text-ink-secondary">Wydaję jednorazowy link do odbioru…</p>}

        {!busy && error && <p className="mt-4 text-sm text-danger">{error}</p>}

        {!busy && link && (
          <>
            <label htmlFor="claim-link-field" className="mt-4 block text-sm text-ink-secondary">
              Wyślij ten jednorazowy link do: {playerName}
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="claim-link-field"
                readOnly
                value={link}
                className="min-h-11 w-full rounded-lg border border-line bg-card-soft px-3 font-mono text-sm text-ink-secondary"
              />
              <button
                type="button"
                onClick={copy}
                className="min-h-11 shrink-0 rounded-lg border border-brass/40 bg-brass/10 px-4 text-brass hover:bg-brass/20"
              >
                {copied ? "Skopiowano" : "Kopiuj"}
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Ten link działa raz. Skopiuj go teraz — nie zostanie pokazany ponownie.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ResetAccessModal({
  playerName,
  token,
  busy,
  error,
  onClose,
}: {
  playerName: string;
  token: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [token, onClose]);

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      const field = document.getElementById("reset-token-field") as HTMLInputElement | null;
      if (field) {
        field.focus();
        field.select();
        try {
          document.execCommand("copy");
        } catch {
          // Manual copy still available via the selected text.
        }
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Reset dostępu dla: ${playerName}`}
        className="card w-full max-w-md bg-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="display text-xs tracking-[0.25em] text-moss">Reset dostępu</p>
            <h2 className="mt-1 break-words text-lg text-ink-primary">{playerName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 shrink-0 rounded-lg px-3 text-ink-muted hover:text-ink-primary"
          >
            Zamknij
          </button>
        </div>

        {busy && (
          <p className="mt-4 text-sm text-ink-secondary">Resetuję dostęp i wydaję nowy token…</p>
        )}

        {!busy && error && <p className="mt-4 text-sm text-danger">{error}</p>}

        {!busy && token && (
          <>
            <label htmlFor="reset-token-field" className="mt-4 block text-sm text-ink-secondary">
              Wyślij ten nowy jednorazowy token do: {playerName}
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="reset-token-field"
                readOnly
                value={token}
                className="min-h-11 w-full rounded-lg border border-line bg-card-soft px-3 font-mono text-sm text-ink-secondary"
              />
              <button
                type="button"
                onClick={copy}
                className="min-h-11 shrink-0 rounded-lg border border-brass/40 bg-brass/10 px-4 text-brass hover:bg-brass/20"
              >
                {copied ? "Skopiowano" : "Kopiuj"}
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Ten token działa raz i zastępuje poprzedni dostęp. Skopiuj go teraz — nie zostanie
              pokazany ponownie.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
