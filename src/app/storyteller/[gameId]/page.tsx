"use client";

// /storyteller/[gameId] — controller layer (spec 19 §7.1). Fetches the
// projection + control/audit feeds, owns every mutation, resolves the active
// view from the URL, and delegates rendering. Rendering/styling lives in the
// view components.

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  api,
  ApiClientError,
  AUDIT_CATEGORIES,
  friendlyMessage,
  type AccessResetResponseDto,
  type AuditCategoryDto,
  type CheckpointResponseDto,
  type StorytellerAuditDto,
  type StorytellerControlDto,
  type StorytellerGameProjection,
  type StorytellerPlayerDto,
  type StorytellerResolutionDto,
} from "@/lib/client-api";
import { useGameEventStream } from "@/components/useGameEventStream";
import { usePresenceHeartbeat } from "@/components/usePresenceHeartbeat";
import { useVersionedMutation } from "@/components/useVersionedMutation";
import { useProjectionReconciliation } from "@/components/useProjectionReconciliation";
import { ProjectionGate } from "@/lib/projection-reconciliation";
import { isStorytellerView, type StorytellerView } from "@/lib/presentation/types";
import { selectPrimaryStorytellerBlocker } from "@/lib/presentation/storyteller-mode";
import { formatTime, phaseLabel } from "@/lib/presentation/labels";
import AppShell, { AppShellContent } from "@/components/ui/AppShell";
import CaseHeader from "@/components/ui/CaseHeader";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Notice from "@/components/ui/Notice";
import Skeleton from "@/components/ui/Skeleton";
import { Eye, EyeOff } from "lucide-react";
import StorytellerShell from "./_components/StorytellerShell";
import ControlView from "./_components/ControlView";
import PlayersView from "./_components/PlayersView";
import GrimoireView from "./_components/GrimoireView";
import ScenarioView from "./_components/ScenarioView";
import AuditView from "./_components/AuditView";
import SystemView, { type RecoveryKind } from "./_components/SystemView";

type ClaimTokenResponse = AccessResetResponseDto & {
  playerId: string;
  claimId: string;
  expiresAt: string;
  version: number;
};

function LoadingShell() {
  return (
    <AppShell>
      <AppShellContent variant="storyteller">
        <Skeleton variant="heading" className="mb-4" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton variant="tile" className="h-44 xl:col-span-2" />
          <Skeleton variant="tile" className="h-44" />
        </div>
        <Skeleton variant="list" className="mt-4" />
      </AppShellContent>
    </AppShell>
  );
}

const auditFilter = (categories: AuditCategoryDto[]) => [...new Set(categories)].sort().join(",");

type StorytellerProjectionOwner = ReturnType<typeof useProjectionReconciliation<StorytellerGameProjection>>;
function StorytellerAccessBoundary() {
  const { gameId } = useParams<{ gameId: string }>();
  const projection = useProjectionReconciliation(gameId, signal => api<StorytellerGameProjection>(`/api/v1/games/${gameId}/storyteller`, { signal }));
  return <StorytellerPageInner key={projection.accessGeneration} projection={projection} />;
}

function StorytellerPageInner({ projection }: { projection: StorytellerProjectionOwner }) {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const view: StorytellerView = isStorytellerView(rawView) ? rawView : "control";

  const { refresh, target } = projection;
  const game = projection.data;
  const failure = projection.error as ApiClientError | null;
  const loading = !game && !failure;
  const fatalError = failure ? friendlyMessage(failure.code ?? "UNKNOWN", "Nie udało się wczytać tej sprawy.") : null;
  const [renamingGame, setRenamingGame] = useState(false);
  const [gameNameDraft, setGameNameDraft] = useState("");

  const [revealClueId, setRevealClueId] = useState("clue-letter");
  const [revealTargetPlayerId, setRevealTargetPlayerId] = useState("");
  const [stageInput, setStageInput] = useState("");

  const [control, setControl] = useState<StorytellerControlDto | null>(null);
  const [audit, setAudit] = useState<StorytellerAuditDto | null>(null);
  const [auditCategories, setAuditCategories] = useState<AuditCategoryDto[]>([]);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [auditHeadPending, setAuditHeadPending] = useState(false);
  const [auditError, setAuditError] = useState(false);
  const [controlError, setControlError] = useState(false);
  const controlGate = useRef(new ProjectionGate(gameId));
  const auditIntent = useRef(0);
  const pendingAuditHead = useRef<number | null>(null);
  const acceptedAudit = useRef<{ filter: string; head: number; snapshot: StorytellerAuditDto } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const gate = new ProjectionGate(gameId);
    controlGate.current = gate;
    ++auditIntent.current;
    return () => { alive.current = false; gate.dispose(); };
  }, [gameId]);
  const auditCategoriesRef = useRef<AuditCategoryDto[]>([]);

  const [checkpointReason, setCheckpointReason] = useState("");
  const [checkpointNote, setCheckpointNote] = useState<string | null>(null);

  const [recoveryKind, setRecoveryKind] = useState<RecoveryKind>("RESOLVE_ACTION");
  const [recoveryTargetId, setRecoveryTargetId] = useState("");
  const [recoveryAlive, setRecoveryAlive] = useState(true);
  const [recoveryReason, setRecoveryReason] = useState("");

  /** Projector safety (audit 18 §6.6): blanks secret role details instantly. */
  const [privacyCovered, setPrivacyCovered] = useState(false);

  const [claimModal, setClaimModal] = useState<{
    acceptedUnavailable?: boolean;
    player: StorytellerPlayerDto;
    link: string | null;
    busy: boolean;
    error: string | null;
  } | null>(null);

  const [resetModal, setResetModal] = useState<{
    acceptedUnavailable?: boolean;
    player: StorytellerPlayerDto;
    token: string | null;
    busy: boolean;
    error: string | null;
  } | null>(null);

  const loadAux = useCallback(async () => {
    const access = projection.captureAccess();
    if (!projection.ownsAccess(access)) return;
    const gate = controlGate.current;
    const ticket = gate.begin();
    try {
      const controlRes = await api<StorytellerControlDto>(
        `/api/v1/games/${gameId}/storyteller/control`,
      );
      if (!projection.ownsAccess(access) || !gate.accept(ticket, controlRes)) return;
      setControl(controlRes);
      setControlError(false);
      target(controlRes.version);
    } catch (error) {
      if (projection.ownsAccess(access) && gate.current(ticket)) { projection.denyAccess(error); setControlError(true); }
    }
  }, [gameId, target, projection.captureAccess, projection.ownsAccess, projection.denyAccess]);

  const loadAudit = useCallback(
    async (categories: AuditCategoryDto[], cursor?: number) => {
      const access = projection.captureAccess();
      if (!projection.ownsAccess(access)) return;
      const filter = auditFilter(categories);
      const accepted = acceptedAudit.current;
      if (cursor !== undefined && (pendingAuditHead.current !== null || !accepted ||
          accepted.filter !== filter || accepted.snapshot.nextCursor !== cursor)) return;
      const intent = ++auditIntent.current;
      const current = () => projection.ownsAccess(access) && alive.current && intent === auditIntent.current &&
        (cursor === undefined || (pendingAuditHead.current === null && acceptedAudit.current?.head === accepted?.head &&
          acceptedAudit.current?.filter === filter && acceptedAudit.current?.snapshot.nextCursor === cursor));
      if (cursor === undefined) {
        pendingAuditHead.current = intent;
        setAuditHeadPending(true);
        setAuditLoadingMore(false);
      } else setAuditLoadingMore(true);
      const query = new URLSearchParams();
      if (categories.length > 0) query.set("categories", categories.join(","));
      if (cursor !== undefined) query.set("cursor", String(cursor));
      const qs = query.toString();
      try {
        const res = await api<StorytellerAuditDto>(
          `/api/v1/games/${gameId}/storyteller/audit${qs ? `?${qs}` : ""}`,
        );
        if (!current()) return;
        setAuditError(false);
        const snapshot = cursor !== undefined ? { ...res,
          events: [...new Map([...(accepted?.snapshot.events ?? []), ...res.events].map(event => [event.sequence, event])).values()],
        } : res;
        acceptedAudit.current = { filter, head: cursor === undefined ? intent : accepted!.head, snapshot };
        setAudit(snapshot);
      } catch (error) {
        if (current()) { projection.denyAccess(error); setAuditError(true); }
      } finally {
        if (projection.ownsAccess(access) && alive.current && intent === auditIntent.current) {
          setAuditLoadingMore(false);
          if (pendingAuditHead.current === intent) {
            pendingAuditHead.current = null;
            setAuditHeadPending(false);
          }
        }
      }
    },
    [gameId, projection.captureAccess, projection.ownsAccess, projection.denyAccess],
  );

  const load = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const gameVersion = game?.version;
  useEffect(() => {
    if (gameVersion !== undefined) { void loadAux(); void loadAudit(auditCategoriesRef.current); }
  }, [gameVersion, loadAux, loadAudit]);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("auditCat") ?? "";
    const categories = param
      .split(",")
      .filter((c): c is AuditCategoryDto => (AUDIT_CATEGORIES as readonly string[]).includes(c));
    auditCategoriesRef.current = categories;
    setAuditCategories(categories);
    void loadAudit(categories);
  }, [loadAudit]);

  const refetchAll = useCallback(() => {
    void load();
    void loadAux();
    void loadAudit(auditCategoriesRef.current);
  }, [load, loadAux, loadAudit]);

  const realtime = useGameEventStream(gameId, refetchAll, projection);
  usePresenceHeartbeat(gameId);

  // The stale banner persists until the user dismisses it or the next mutation
  // succeeds — a version conflict is worth an explicit acknowledgement.
  const { busy, actionError, stale, setActionError, run, runWithResult } =
    useVersionedMutation(load, { scope: gameId, ready: () => game !== null && projection.canCommand(game),
      current: () => projection.isCurrent(gameId), acknowledge: projection.acknowledge,
      captureAccess: projection.captureAccess, ownsAccess: projection.ownsAccess, denyAccess: projection.denyAccess });
  const canCommand = () => game !== null && projection.canCommand(game) && !busy;
  const commandsBusy = busy || !projection.ready;

  function mutate(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    payload: Record<string, unknown> = {},
  ) {
    if (!game || !canCommand()) return Promise.resolve(false);
    return run(() =>
      api(path, {
        method,
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          ...payload,
        }),
      }),
    );
  }

  // ---- Roster -----------------------------------------------------------------
  async function handleAddPlayer(name: string) {
    const ok = await mutate(`/api/v1/games/${gameId}/players`, "POST", {
      payload: { displayName: name },
    });
    return ok;
  }

  async function handleRenamePlayer(playerId: string, displayName: string) {
    await mutate(`/api/v1/games/${gameId}/players/${playerId}`, "PATCH", {
      payload: { displayName },
    });
  }

  async function handleRemovePlayer(player: StorytellerPlayerDto) {
    await mutate(`/api/v1/games/${gameId}/players/${player.id}`, "DELETE");
  }

  async function handleMovePlayer(playerId: string, direction: -1 | 1) {
    if (!game) return;
    const sorted = [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat);
    const index = sorted.findIndex((p) => p.id === playerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await mutate(`/api/v1/games/${gameId}/players/reorder`, "POST", {
      payload: { orderedPlayerIds: reordered.map((p) => p.id) },
    });
  }

  async function issueClaim(player: StorytellerPlayerDto) {
    if (!game || !canCommand()) return;
    const access = projection.captureAccess();
    const result = await runWithResult(() => api<ClaimTokenResponse>(
        `/api/v1/games/${gameId}/players/${player.id}/claim-token`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            expectedVersion: game.version,
          }),
        },
      ));
    if (!alive.current || !projection.ownsAccess(access)) return;
    if (result.ok && result.value) {
      const res = result.value;
      setClaimModal({
        player,
        link: res.claimToken ? `${window.location.origin}/claim#${res.claimToken}` : null,
        busy: false,
        error: null,
        acceptedUnavailable: !res.credentialAvailable,
      });
    } else {
      setClaimModal({
        player,
        link: null,
        busy: false,
        error: "Nie udało się wydać linku do odbioru.",
      });
    }
  }

  function openClaim(player: StorytellerPlayerDto) {
    if (!canCommand()) return;
    setClaimModal({ player, link: null, busy: true, error: null });
    void issueClaim(player);
  }

  async function resetPlayerAccess(player: StorytellerPlayerDto) {
    if (!game || !canCommand()) return;
    const access = projection.captureAccess();
    const result = await runWithResult(() => api<AccessResetResponseDto>(
        `/api/v1/games/${gameId}/players/${player.id}/access/reset`,
        {
          method: "POST",
          body: JSON.stringify({
            commandId: crypto.randomUUID(),
            expectedVersion: game.version,
          }),
        },
      ));
    if (!alive.current || !projection.ownsAccess(access)) return;
    if (result.ok && result.value) {
      const res = result.value;
      setResetModal({ player, token: res.credentialAvailable ? res.claimToken : null, busy: false, error: null, acceptedUnavailable: !res.credentialAvailable });
    } else {
      setResetModal({
        player,
        token: null,
        busy: false,
        error: "Nie udało się zresetować dostępu.",
      });
    }
  }

  function openResetAccess(player: StorytellerPlayerDto) {
    if (!canCommand()) return;
    setResetModal({ player, token: null, busy: true, error: null });
    void resetPlayerAccess(player);
  }

  // ---- Setup / operational / investigation / scenario ------------------------
  async function handleGenerateSetup() {
    await mutate(`/api/v1/games/${gameId}/setup/generate`, "POST");
  }

  async function handleCommitSetup() {
    await mutate(`/api/v1/games/${gameId}/setup/commit`, "POST");
  }

  async function handleStartOperational() {
    await mutate(`/api/v1/games/${gameId}/operational/start`, "POST");
  }

  async function handleResolveAction(
    actionId: string,
    resolution: StorytellerResolutionDto | undefined,
  ) {
    await mutate(`/api/v1/games/${gameId}/storyteller/actions/${actionId}/resolve`, "POST", {
      payload: resolution ? { resolution } : {},
    });
  }

  async function handleCompleteOperational() {
    await mutate(`/api/v1/games/${gameId}/operational/complete`, "POST");
  }

  async function handleOpenNominations() {
    await mutate(`/api/v1/games/${gameId}/investigation/nominations/open`, "POST");
  }

  async function handleCloseNominations() {
    await mutate(`/api/v1/games/${gameId}/investigation/nominations/close`, "POST");
  }

  async function handleStartVoting(nominationId: string) {
    await mutate(`/api/v1/games/${gameId}/nominations/${nominationId}/voting/start`, "POST");
  }

  async function handleAdvanceVoting(nominationId: string) {
    await mutate(`/api/v1/games/${gameId}/nominations/${nominationId}/voting/advance`, "POST");
  }

  async function handleLockVote(nominationId: string) {
    await mutate(`/api/v1/games/${gameId}/nominations/${nominationId}/votes/lock`, "POST");
  }

  async function handleResolveTrigger(nominationId: string, optionId: string) {
    await mutate(`/api/v1/games/${gameId}/nominations/${nominationId}/triggers/resolve`, "POST", {
      payload: { optionId },
    });
  }

  async function handleResolveExecution() {
    await mutate(`/api/v1/games/${gameId}/investigation/resolve-execution`, "POST");
  }

  async function handleCloseInvestigation() {
    await mutate(`/api/v1/games/${gameId}/investigation/close`, "POST");
  }

  async function handleExileTraveller(playerId: string) {
    await mutate(`/api/v1/games/${gameId}/traveller/exile`, "POST", { payload: { playerId } });
  }

  async function handleRenameGame() {
    const trimmed = gameNameDraft.trim();
    if (!trimmed || !game || !canCommand()) return;
    const ok = await run(() =>
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

  async function handleRevealClue(clueId: string, targetPlayerId: string | null) {
    await mutate(`/api/v1/games/${gameId}/storyteller/scenario/clues/${clueId}/reveal`, "POST", {
      payload: targetPlayerId ? { targetPlayerId } : {},
    });
  }

  async function handleCompleteTask(taskId: string) {
    await mutate(`/api/v1/games/${gameId}/storyteller/scenario/tasks/${taskId}/complete`, "POST");
  }

  async function handleSetStage(stageId: string) {
    if (!stageId.trim()) return;
    await mutate(`/api/v1/games/${gameId}/storyteller/scenario/stage`, "POST", {
      payload: { stageId: stageId.trim() },
    });
  }

  async function handleSetMap(mapVersionId: string) {
    await mutate(`/api/v1/games/${gameId}/storyteller/scenario/map`, "POST", {
      payload: { mapVersionId },
    });
  }

  async function handleSetCondition(conditionId: string, active: boolean) {
    await mutate(`/api/v1/games/${gameId}/storyteller/scenario/conditions`, "POST", {
      payload: { conditionId, active },
    });
  }

  // ---- System -----------------------------------------------------------------
  /** Prefill the override target from the current blocking action — only when
   *  the Storyteller has not started typing (unrelated refetches must never
   *  stomp a mid-form selection). */
  const lastBlockingActionId = useRef<string | null>(null);
  useEffect(() => {
    const blocking = control?.blockingAction ?? null;
    const blockingId = blocking?.id ?? null;
    if (!blocking || blockingId === lastBlockingActionId.current) return;
    lastBlockingActionId.current = blockingId;
    if (recoveryTargetId.trim() !== "") return;
    const needsPlayer = recoveryKind === "CORRECT_ALIVE" || recoveryKind === "RESTORE_GHOST_VOTE";
    setRecoveryTargetId(needsPlayer ? (blocking.actorPlayerId ?? "") : blocking.id);
  }, [control, recoveryKind, recoveryTargetId]);

  async function handleCreateCheckpoint() {
    if (!canCommand()) return;
    const reason = checkpointReason.trim();
    setCheckpointNote(null);
    const res = await runWithResult<CheckpointResponseDto>(() =>
      api(`/api/v1/games/${gameId}/storyteller/checkpoints`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game?.version,
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
    const reason = recoveryReason.trim();
    if (!reason || !game || !canCommand() || controlError || !control || control.version < game.version) return;
    const target = recoveryTargetId.trim() || undefined;
    const payload =
      recoveryKind === "CORRECT_ALIVE"
        ? { kind: recoveryKind, playerId: target, alive: recoveryAlive, reason }
        : recoveryKind === "RESTORE_GHOST_VOTE"
          ? { kind: recoveryKind, playerId: target, reason }
          : { kind: recoveryKind, actionId: target, reason };
    const ok = await mutate(`/api/v1/games/${gameId}/storyteller/recovery/override`, "POST", { payload });
    if (ok) {
      setRecoveryReason("");
      setRecoveryTargetId("");
    }
  }

  // ---- Derived -----------------------------------------------------------------
  const blocker = game ? selectPrimaryStorytellerBlocker(game) : null;
  const nameById = new Map((game?.players ?? []).map((p) => [p.id, p.displayName]));
  const gameEnded = game?.status === "ENDED" || game?.result !== null;
  const renameEnabled = game ? game.status === "LOBBY" || game.status === "SETUP" : false;
  const ready = game?.isReady ?? false;
  const need = game ? Math.max(0, 13 - game.participantCount) : 0;

  function navigate(next: StorytellerView) {
    const url = next === "control" ? `/storyteller/${gameId}` : `/storyteller/${gameId}?view=${next}`;
    router.replace(url, { scroll: false });
  }

  return (
    <AppShell>
      <CaseHeader
        phaseLabel={game ? phaseLabel(game.phase, game.status) : "Sprawa"}
        cycleLabel={game && game.phase !== null ? `cykl ${game.cycleNumber}` : undefined}
        caseName={game?.name ?? undefined}
        mode={gameEnded ? "critical" : "quiet"}
        connection={game ? realtime : undefined}
        privacy={privacyCovered ? "private" : "public"}
        right={
          game && (
            <Button
              variant={privacyCovered ? "secondary" : "quiet"}
              size="sm"
              icon={
                privacyCovered ? (
                  <Eye aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <EyeOff aria-hidden="true" className="h-4 w-4" />
                )
              }
              aria-pressed={privacyCovered}
              onClick={() => setPrivacyCovered((value) => !value)}
            >
              {privacyCovered ? "Odkryj" : "Zasłoń"}
            </Button>
          )
        }
      />

      <AppShellContent variant="storyteller" className="max-w-none">
        {loading && !game && (
          <div className="flex flex-col gap-4">
            <Skeleton variant="heading" />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Skeleton variant="tile" className="h-44 xl:col-span-2" />
              <Skeleton variant="tile" className="h-44" />
            </div>
            <Skeleton variant="list" />
          </div>
        )}

        {!loading && fatalError && !game && (
          <div className="mx-auto max-w-md">
            <Notice variant="error" className="mb-3">
              {fatalError}
            </Notice>
            <Button
              fullWidth
              onClick={() => {
                void load();
              }}
            >
              Spróbuj ponownie
            </Button>
          </div>
        )}

        {game && (
          <>
            {!privacyCovered && (stale || actionError) && (
              <div className="mb-4 flex flex-col gap-2">
                {stale && (
                  <Notice variant="warning">
                    Ta sprawa zmieniła się w innej karcie. Sprawdź bieżący stan przed ponowieniem akcji.
                  </Notice>
                )}
                {actionError && (
                  <Notice variant="error">
                    {actionError}{" "}
                    <button
                      type="button"
                      onClick={() => setActionError(null)}
                      className="min-h-11 rounded-control px-2 text-danger underline-offset-2 hover:underline"
                    >
                      Zamknij
                    </button>
                  </Notice>
                )}
              </div>
            )}

            <StorytellerShell active={view} onNavigate={navigate} renaming={renamingGame} onStartRename={() => { setGameNameDraft(game.name); setRenamingGame(true); }} onCancelRename={() => { setRenamingGame(false); setGameNameDraft(""); }} onCommitRename={() => void handleRenameGame()} gameNameDraft={gameNameDraft} onGameNameDraftChange={setGameNameDraft} renameEnabled={renameEnabled} busy={commandsBusy} game={game}>
              {privacyCovered ? (
                <Notice variant="private">Zasłonięto — odsłoń widok, aby kontynuować.</Notice>
              ) : <>
              {!projection.ready && <Notice variant={fatalError ? "error" : "warning"}>
                {fatalError ?? "Aktualizacja sprawy — polecenia czekają na bieżący stan."}
                <Button variant="quiet" onClick={() => void load()}>Spróbuj ponownie</Button>
              </Notice>}
              {(controlError || (control && control.version < game.version)) && <Notice variant="warning">
                Panel sterowania jest nieaktualny lub niedostępny.
                <Button variant="quiet" onClick={() => void loadAux()}>Odśwież panel</Button>
              </Notice>}
              {view === "control" && blocker && (
                <ControlView
                  game={game}
                  blocker={blocker}
                  control={control}
                  realtime={realtime}
                  nameById={nameById}
                  busy={commandsBusy}
                  gameEnded={gameEnded}
                  ready={ready}
                  need={need}
                  privacyCovered={privacyCovered}
                  onStartOperational={() => void handleStartOperational()}
                  onCompleteOperational={() => void handleCompleteOperational()}
                  onResolveAction={(actionId, resolution) => void handleResolveAction(actionId, resolution)}
                  onOpenNominations={() => void handleOpenNominations()}
                  onCloseNominations={() => void handleCloseNominations()}
                  onStartVoting={(id) => void handleStartVoting(id)}
                  onAdvanceVoting={(id) => void handleAdvanceVoting(id)}
                  onLockVote={(id) => void handleLockVote(id)}
                  onResolveTrigger={(id, optionId) => void handleResolveTrigger(id, optionId)}
                  onResolveExecution={() => void handleResolveExecution()}
                  onCloseInvestigation={() => void handleCloseInvestigation()}
                  onExileTraveller={(playerId) => void handleExileTraveller(playerId)}
                  onNavigate={navigate}
                />
              )}
              {view === "players" && (
                <PlayersView
                  game={game}
                  busy={commandsBusy}
                  renameEnabled={renameEnabled}
                  onAddPlayer={(name) => handleAddPlayer(name)}
                  onRenamePlayer={(playerId, name) => void handleRenamePlayer(playerId, name)}
                  onRemovePlayer={(player) => void handleRemovePlayer(player)}
                  onMovePlayer={(playerId, direction) => void handleMovePlayer(playerId, direction)}
                  onIssueClaim={openClaim}
                  onResetAccess={openResetAccess}
                />
              )}
              {view === "grimoire" && (
                <GrimoireView
                  game={game}
                  busy={commandsBusy}
                  privacyCovered={privacyCovered}
                  onGenerateSetup={() => void handleGenerateSetup()}
                  onCommitSetup={() => void handleCommitSetup()}
                />
              )}
              {view === "scenario" && (
                <ScenarioView
                  game={game}
                  busy={commandsBusy}
                  revealClueId={revealClueId}
                  onRevealClueIdChange={setRevealClueId}
                  revealTargetPlayerId={revealTargetPlayerId}
                  onRevealTargetPlayerIdChange={setRevealTargetPlayerId}
                  stageInput={stageInput}
                  onStageInputChange={setStageInput}
                  onRevealClue={(clueId, targetPlayerId) => void handleRevealClue(clueId, targetPlayerId)}
                  onCompleteTask={(taskId) => void handleCompleteTask(taskId)}
                  onSetStage={(stageId) => void handleSetStage(stageId)}
                  onSetMap={(mapVersionId) => void handleSetMap(mapVersionId)}
                  onSetCondition={(conditionId, active) => void handleSetCondition(conditionId, active)}
                />
              )}
              {view === "audit" && (
                <AuditView
                  audit={audit}
                  auditError={auditError}
                  auditLoadingMore={auditLoadingMore}
                  auditPaginationBlocked={auditHeadPending || acceptedAudit.current?.filter !== auditFilter(auditCategories)}
                  onRetry={() => void loadAudit(auditCategoriesRef.current)}
                  selectedCategories={auditCategories}
                  onToggleCategory={(id) => {
                    const next = auditCategories.includes(id)
                      ? auditCategories.filter((c) => c !== id)
                      : [...auditCategories, id];
                    auditCategoriesRef.current = next;
                    setAuditCategories(next);
                    const url = new URL(window.location.href);
                    if (next.length === 0) url.searchParams.delete("auditCat");
                    else url.searchParams.set("auditCat", next.join(","));
                    window.history.replaceState(null, "", url.toString());
                    void loadAudit(next);
                  }}
                  onClearCategories={() => {
                    auditCategoriesRef.current = [];
                    setAuditCategories([]);
                    const url = new URL(window.location.href);
                    url.searchParams.delete("auditCat");
                    window.history.replaceState(null, "", url.toString());
                    void loadAudit([]);
                  }}
                  onLoadMore={() => {
                    if (!audit?.nextCursor) return;
                    void loadAudit(auditCategoriesRef.current, audit.nextCursor);
                  }}
                  formatTime={formatTime}
                />
              )}
              {view === "system" && (
                <SystemView
                  control={control}
                  nameById={nameById}
                  realtime={realtime}
                  players={game.players}
                  actions={game.operational?.actions ?? []}
                  checkpointReason={checkpointReason}
                  onCheckpointReasonChange={setCheckpointReason}
                  onCreateCheckpoint={() => void handleCreateCheckpoint()}
                  checkpointBusy={commandsBusy}
                  checkpointNote={checkpointNote}
                  recoveryKind={recoveryKind}
                  onRecoveryKindChange={setRecoveryKind}
                  recoveryTargetId={recoveryTargetId}
                  onRecoveryTargetIdChange={setRecoveryTargetId}
                  recoveryAlive={recoveryAlive}
                  onRecoveryAliveChange={setRecoveryAlive}
                  recoveryReason={recoveryReason}
                  onRecoveryReasonChange={setRecoveryReason}
                  onSubmitRecovery={() => void handleRecoveryOverride()}
                  recoveryBusy={commandsBusy || controlError || !control || control.version < game.version}
                  formatTime={formatTime}
                />
              )}
              </>}
            </StorytellerShell>
          </>
        )}
      </AppShellContent>

      {game && !privacyCovered && claimModal && (
        <Dialog
          open
          onClose={() => setClaimModal(null)}
          title={`Link do odbioru: ${claimModal.player.displayName}`}
          description="Wyślij ten jednorazowy link do gracza. Działa raz i nie zostanie pokazany ponownie."
        >
          {claimModal.busy && <p className="text-sm text-ink-secondary">Wydaję jednorazowy link do odbioru…</p>}
          {claimModal.acceptedUnavailable && <Notice>Polecenie przyjęto wcześniej. Jednorazowy link nie jest już dostępny. Odśwież stan przed świadomym wydaniem nowego linku.</Notice>}
          {!claimModal.busy && claimModal.error && (
            <Notice variant="error">{claimModal.error}</Notice>
          )}
          {!claimModal.busy && claimModal.link && (
            <CopyField value={claimModal.link} label="Link do odbioru" />
          )}
        </Dialog>
      )}

      {game && !privacyCovered && resetModal && (
        <Dialog
          open
          onClose={() => setResetModal(null)}
          title={`Reset dostępu: ${resetModal.player.displayName}`}
          description="Nowy jednorazowy token zastępuje poprzedni dostęp gracza. Nie zostanie pokazany ponownie."
        >
          {resetModal.busy && <p className="text-sm text-ink-secondary">Resetuję dostęp i wydaję nowy token…</p>}
          {resetModal.acceptedUnavailable && <Notice>Reset przyjęto wcześniej. Jednorazowy token nie jest już dostępny. Nie zresetowano dostępu ponownie. Odśwież stan przed świadomym wydaniem nowego linku.</Notice>}
          {!resetModal.busy && resetModal.error && (
            <Notice variant="error">{resetModal.error}</Notice>
          )}
          {!resetModal.busy && resetModal.token && (
            <CopyField value={resetModal.token} label="Token odbioru" />
          )}
        </Dialog>
      )}
    </AppShell>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const fieldId = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const field = document.getElementById(fieldId) as HTMLInputElement | null;
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
    <>
      <label htmlFor={fieldId} className="block text-sm text-ink-secondary">
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={fieldId}
          readOnly
          value={value}
          className="min-h-11 w-full rounded-control border border-line bg-card-soft px-3 font-mono text-sm text-ink-secondary"
        />
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? "Skopiowano" : "Kopiuj"}
        </Button>
      </div>
    </>
  );
}

export default function StorytellerPage() {
  const params = useParams<{ gameId: string }>();
  return (
    <Suspense fallback={<LoadingShell />}>
      <StorytellerAccessBoundary key={params.gameId} />
    </Suspense>
  );
}
