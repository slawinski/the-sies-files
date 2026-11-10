"use client";

// /player — controller layer (spec 19 §6.1). Fetches the projection, owns the
// event stream and mutations, resolves the view from the URL, and delegates
// rendering to the view components. No card/button styling lives here.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  api,
  ApiClientError,
  friendlyMessage,
  type PlayerGameProjection,
  type PlayerScenarioDto,
  type ScanResponseDto,
} from "@/lib/client-api";
import { useGameEventStream } from "@/components/useGameEventStream";
import { usePresenceHeartbeat } from "@/components/usePresenceHeartbeat";
import { useVersionedMutation } from "@/components/useVersionedMutation";
import { useProjectionReconciliation } from "@/components/useProjectionReconciliation";
import { isAccessDenial } from "@/lib/access-lifetime";
import { clearPendingQr, decodeScanAcknowledgement, decodeScanStatus, definitelyRejected,
  hydratePendingQr, retainPendingQr, type PendingQrIdentity } from "@/lib/command-outcome";
import { isPlayerView, type PlayerView } from "@/lib/presentation/types";
import {
  requiredTargetCount,
  selectActiveVotingNomination,
  selectPlayerPresentation,
} from "@/lib/presentation/player-mode";
import { phaseLabel } from "@/lib/presentation/labels";
import AppShell, { AppShellContent } from "@/components/ui/AppShell";
import BottomNav from "@/components/ui/BottomNav";
import CaseHeader from "@/components/ui/CaseHeader";
import Notice from "@/components/ui/Notice";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import PlayerCaseView from "./_components/PlayerCaseView";
import PlayerPeopleView from "./_components/PlayerPeopleView";
import PlayerJournalView from "./_components/PlayerJournalView";
import PlayerMapView from "./_components/PlayerMapView";

function isDuplicateOutcome(
  outcome: ScanResponseDto["outcome"],
): outcome is { duplicate: true } {
  return "duplicate" in outcome && outcome.duplicate === true;
}

function describeScanOutcome(
  outcome: ScanResponseDto["outcome"],
  scenario: PlayerScenarioDto | null,
): string {
  if (isDuplicateOutcome(outcome)) {
    return "Ten kod został już wykorzystany.";
  }
  const parts: string[] = [];
  if (outcome.discoveries.length > 0) {
    const titles = outcome.discoveries
      .map((id) => scenario?.clues.find((c) => c.id === id)?.title)
      .filter((title): title is string => title !== undefined);
    parts.push(
      titles.length > 0 ? `Nowe dowody: ${titles.join(", ")}` : "Otrzymano nowy dowód.",
    );
  }
  if (outcome.tasks.length > 0) {
    const titles = outcome.tasks
      .map((id) => scenario?.tasks.find((t) => t.id === id)?.title)
      .filter((title): title is string => title !== undefined);
    parts.push(
      titles.length > 0 ? `Nowe zadania: ${titles.join(", ")}` : "Otrzymano nowe zadanie.",
    );
  }
  if (outcome.mapVersionId) {
    parts.push(
      outcome.mapVersionId === "MAP_EXTENDED"
        ? "Mapa rozszerzona odblokowana — aneks dołączony do akt."
        : "Mapa zaktualizowana.",
    );
  }
  for (const conditionId of outcome.conditions) {
    if (conditionId === "INJURED") parts.push("Jesteś ranny — znajdź apteczkę.");
  }
  return parts.length > 0 ? parts.join(" ") : "Skan przyjęty.";
}

function PlayerLoadingShell() {
  return (
    <AppShell>
      <AppShellContent>
        <Skeleton variant="heading" className="mb-4" />
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Skeleton variant="stat" className="h-20" />
          <Skeleton variant="stat" className="h-20" />
        </div>
        <Skeleton variant="map" />
      </AppShellContent>
    </AppShell>
  );
}

type PlayerProjectionOwner = ReturnType<typeof useProjectionReconciliation<PlayerGameProjection>>;
function PlayerAccessBoundary() {
  const projection = useProjectionReconciliation(null, signal => api<PlayerGameProjection>("/api/v1/me", { signal }));
  useEffect(() => {
    if (isAccessDenial(projection.error, true)) clearPendingQr();
  }, [projection.error]);
  const identity = projection.data ? `${projection.data.gameId}:${projection.data.me.playerId}` : "unbound";
  return <PlayerPageInner key={`${projection.accessGeneration}:${identity}`} projection={projection} />;
}

function PlayerPageInner({ projection }: { projection: PlayerProjectionOwner }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const requestedView: PlayerView = isPlayerView(rawView) ? rawView : "case";

  const { refresh } = projection;
  const game = projection.data;
  const failure = projection.error as ApiClientError | null;
  const error = failure ? friendlyMessage(failure.code ?? "UNKNOWN", "Nie udało się wczytać twojej sprawy.") : null;
  const state = game ? "ready" : failure?.status === 401 ? "unclaimed" : error ? "error" : "loading";
  const currentGame = useRef(game);
  currentGame.current = game;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nomineeId, setNomineeId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const pendingQr = useRef<PendingQrIdentity | null>(null);
  const checkingQr = useRef(false);
  const [qrState, setQrState] = useState<"ready" | "sending" | "unresolved" | "checking" | "unreadable">("ready");
  const [reloadUnavailable, setReloadUnavailable] = useState(false);

  const fetchProjection = useCallback(async (): Promise<PlayerGameProjection> => {
    const outcome = await refresh();
    if (outcome.status === "applied") return outcome.projection;
    throw outcome.status === "failed" ? outcome.error : new Error("Aktualizacja oczekuje.");
  }, [refresh]);

  const apply = useCallback(async () => {
    await fetchProjection();
  }, [fetchProjection]);

  const load = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const gameId = game?.gameId ?? null;
  const playerId = game?.me.playerId ?? null;
  const realtime = useGameEventStream(gameId, () => void projection.refresh(), projection);
  usePresenceHeartbeat(gameId);
  const { busy, actionError, stale, setActionError, run, runWithResult, recoverWithResult } =
    useVersionedMutation(apply, { scope: gameId && playerId ? `${gameId}:${playerId}` : null, ready: () => game !== null && projection.canCommand(game),
      current: () => projection.isCurrent(gameId), acknowledge: projection.acknowledge,
      captureAccess: projection.captureAccess, ownsAccess: projection.ownsAccess, denyAccess: projection.denyAccess });
  const canCommand = () => game !== null && projection.canCommand(game) && !busy;
  useEffect(() => { setScanMessage(null); setScanError(null); setNomineeId(null); }, [gameId]);

  const checkQrRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!gameId || !playerId) return;
    const ticket = projection.captureAccess();
    if (!projection.ownsAccess(ticket)) return;
    const identity = hydratePendingQr(gameId, playerId);
    pendingQr.current = identity;
    if (identity) { setQrState("unresolved"); void checkQrRef.current(); }
    return () => {
      // Access generations remount this private view. A normal reload retains
      // identity; detected access loss or a changed scope must discard it.
      if (!projection.ownsAccess(ticket) || currentGame.current?.gameId !== gameId || currentGame.current?.me.playerId !== playerId) {
        if (pendingQr.current) clearPendingQr(pendingQr.current);
        pendingQr.current = null;
      }
    };
  }, [gameId, playerId, projection.captureAccess, projection.ownsAccess]);

  // Reset the target picker whenever the active action changes.
  const activeActionId = game?.activeAction?.id ?? null;
  useEffect(() => {
    setSelectedIds([]);
  }, [activeActionId]);

  async function handleAcknowledgeRole() {
    if (!game || !canCommand()) return;
    await run(() =>
      api(`/api/v1/games/${game.gameId}/role-reveal/ack`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleSubmitAction() {
    if (!game?.activeAction || !canCommand()) return;
    await run(() =>
      api(`/api/v1/games/${game.gameId}/operational/actions/${game.activeAction!.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { targetPlayerIds: selectedIds },
        }),
      }),
    );
  }

  function toggleTarget(id: string, max: number) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  async function handleNominate() {
    if (!game || !nomineeId || !canCommand()) return;
    const ok = await run(() =>
      api(`/api/v1/games/${game.gameId}/nominations`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { nomineeId },
        }),
      }),
    );
    if (ok) setNomineeId(null);
  }

  async function handleVote(nominationId: string, intent: boolean) {
    if (!game || !canCommand()) return;
    await run(() =>
      api(`/api/v1/games/${game.gameId}/nominations/${nominationId}/votes/intent`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { intent },
        }),
      }),
    );
  }

  async function scanWithToken(token: string): Promise<void> {
    if (!game || !canCommand() || pendingQr.current) throw new Error("Scan is not ready");
    const access = projection.captureAccess();
    const identity: PendingQrIdentity = { format: 1, gameId: game.gameId, playerId: game.me.playerId, operation: "scanQr", commandId: crypto.randomUUID() };
    const valid = () => projection.ownsAccess(access) && currentGame.current?.gameId === identity.gameId && currentGame.current?.me.playerId === identity.playerId;
    pendingQr.current = identity;
    setReloadUnavailable(!retainPendingQr(identity));
    setQrState("sending");
    setScanMessage(null);
    setScanError(null);
    let failure: unknown;
    const result = await runWithResult(() => api<unknown>(`/api/v1/games/${game.gameId}/scenario/qr/scan`, {
        method: "POST",
        body: JSON.stringify({
          commandId: identity.commandId,
          expectedVersion: game.version,
          payload: { token },
        }),
      }).then(decodeScanAcknowledgement).catch((error: ApiClientError) => {
        failure = error;
        if (valid() && definitelyRejected(error)) {
          setScanError(error.code === "TERRAIN_UNAVAILABLE"
            ? "Teren niedostępny — skanowanie możliwe tylko podczas śledztwa, poza formalnymi nominacjami."
            : error.code === "QR_ALREADY_CONSUMED" ? "Ten kod został już wykorzystany."
            : friendlyMessage(error.code ?? "UNKNOWN", "Coś poszło nie tak."));
        }
        throw error;
      }));
    if (!valid()) throw new Error("Access changed");
    if (result.ok && result.value) {
      clearPendingQr(identity); pendingQr.current = null; setQrState("ready");
      setScanMessage(describeScanOutcome(result.value.outcome, currentGame.current!.scenario));
    } else {
      if (definitelyRejected(failure)) {
        clearPendingQr(identity); pendingQr.current = null; setQrState("ready");
      } else {
        setQrState("unresolved"); setActionError(null);
      }
      // QrScanner must not show its own success for an uncertain acknowledgement.
      throw new Error("Scan outcome not acknowledged");
    }
  }

  async function checkQrOutcome(): Promise<void> {
    const identity = pendingQr.current;
    const access = projection.captureAccess();
    const valid = () => projection.ownsAccess(access) && currentGame.current?.gameId === identity?.gameId && currentGame.current?.me.playerId === identity?.playerId;
    if (!identity || checkingQr.current || !valid()) return;
    checkingQr.current = true; setQrState("checking");
    try {
      const result = await recoverWithResult(async () => decodeScanStatus(await api<unknown>(
        `/api/v1/games/${identity.gameId}/me/commands/${identity.commandId}`), identity));
      if (!valid()) return;
      if (result) {
        clearPendingQr(identity); pendingQr.current = null; setQrState("ready");
        setScanMessage(describeScanOutcome(result.outcome, currentGame.current!.scenario));
      } else setQrState("unresolved");
    } catch (error) {
      if (valid()) setQrState(error instanceof ApiClientError && error.code === "COMMAND_RECEIPT_INVALID" ? "unreadable" : "unresolved");
    } finally { checkingQr.current = false; }
  }
  checkQrRef.current = checkQrOutcome;

  function navigate(next: PlayerView) {
    const url = next === "case" ? "/player" : `/player?view=${next}`;
    router.replace(url, { scroll: false });
  }

  const mode = game ? selectPlayerPresentation(game) : null;
  const revealActive = mode === "ROLE_REVEAL";
  // Gate every destination without rewriting the bookmarked URL. Acknowledging
  // restores the requested destination; a reload starts the reveal covered again.
  const view: PlayerView = revealActive ? "case" : requestedView;
  const formal = mode === "FORMAL_VOTING" || mode === "FORMAL_NOMINATION";
  const connectionBlocked = !projection.ready;

  const headerMode = mode === "GAME_ENDED" ? "critical" : formal ? "formal" : "quiet";
  const sortedRoster = game ? [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat) : [];
  const votingNomination = game ? selectActiveVotingNomination(game) : null;
  const scanRecovery = qrState !== "ready" ? <Notice variant="warning">
    {qrState === "sending" ? "Wysyłam skan…" : qrState === "checking" ? "Sprawdzam wynik skanu…" : qrState === "unreadable"
      ? "Skan przyjęto, ale zapisany wynik jest nieczytelny. Nie skanuj ponownie."
      : "Wynik skanu jest nieustalony. Brak wyniku nie oznacza, że skan się nie zapisał. Nie skanuj ponownie."}
    {!["sending", "checking"].includes(qrState) && <Button variant="quiet" onClick={() => void checkQrOutcome()}>Sprawdź wynik skanu</Button>}
  </Notice> : null;

  return (
    <AppShell texture>
      {!revealActive && (
        <CaseHeader
          phaseLabel={game ? phaseLabel(game.phase, game.status) : "The Sieś Files"}
          cycleLabel={game && game.phase !== null ? `cykl ${game.cycleNumber}` : undefined}
          mode={headerMode}
          connection={game ? realtime : undefined}
          privacy={formal ? "public" : game?.myRole ? "private" : "public"}
        />
      )}

      <AppShellContent className={revealActive ? "" : "content-bottom-nav"}>
        {state === "loading" && !game && (
          <div className="flex flex-col gap-3">
            <Skeleton variant="heading" />
            <Skeleton variant="stat" className="h-24" />
            <Skeleton variant="list" />
          </div>
        )}

        {state === "error" && (
          <div className="mx-auto max-w-md">
            <Notice variant="error" className="mb-3">
              {error}
            </Notice>
            <Button fullWidth onClick={() => void load()}>
              Spróbuj ponownie
            </Button>
          </div>
        )}

        {state === "unclaimed" && (
          <div className="mx-auto max-w-md text-center">
            <p className="eyebrow">Tożsamość</p>
            <p className="mt-3 text-base text-ink-primary">
              Nie odebrano jeszcze twojej tożsamości — otwórz link do odbioru.
            </p>
            <Link href="/claim">
              <Button fullWidth className="mt-5">
                Mam link do odbioru
              </Button>
            </Link>
          </div>
        )}

        {state === "ready" && game && (
          <div className="flex flex-col gap-3">
            {view !== "map" && scanRecovery}
            {reloadUnavailable && <Notice>Przechowywanie w tej karcie jest zablokowane. Możesz sprawdzić wynik tutaj, ale odzyskanie po przeładowaniu nie będzie dostępne.</Notice>}
            {view !== "map" && scanMessage && <Notice variant="success">{scanMessage}</Notice>}
            {!projection.ready && (
              <Notice variant={error ? "error" : "warning"}>
                {error ?? "Aktualizacja sprawy — polecenia czekają na bieżący stan."}
                <Button variant="quiet" onClick={() => void load()}>Spróbuj ponownie</Button>
              </Notice>
            )}
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

            {!revealActive && game.scenario?.conditions.includes("INJURED") && (
              <Notice variant="warning">Jesteś ranny — znajdź apteczkę.</Notice>
            )}

            {view === "case" && (
              <PlayerCaseView
                key={`${game.gameId}:${game.me.playerId}`}
                game={game}
                selectedIds={selectedIds}
                onToggleTarget={(id) => {
                  const active = game.activeAction;
                  if (!active) return;
                  const max = requiredTargetCount(active.kind);
                  if (max !== null) toggleTarget(id, max);
                }}
                onSubmitAction={() => void handleSubmitAction()}
                busy={busy || !projection.ready}
                connectionBlocked={connectionBlocked}
                nomineeId={nomineeId}
                onSelectNominee={setNomineeId}
                onSubmitNomination={() => void handleNominate()}
                onVote={(id, intent) => void handleVote(id, intent)}
                onAcknowledgeRole={() => void handleAcknowledgeRole()}
                onNavigate={navigate}
                freshnessNotice={!projection.ready ? <Notice variant={error ? "error" : "warning"}>
                  {error ?? "Aktualizacja sprawy…"}
                  <Button variant="quiet" onClick={() => void load()}>Spróbuj ponownie</Button>
                </Notice> : undefined}
              />
            )}
            {view === "people" && (
              <PlayerPeopleView
                players={sortedRoster}
                mePlayerId={game.me.playerId}
                votingNomination={votingNomination}
              />
            )}
            {view === "journal" && <PlayerJournalView game={game} />}
            {view === "map" && (
              <PlayerMapView
                game={game}
                scanRecovery={scanRecovery}
                busy={busy || !projection.ready || qrState !== "ready"}
                scanMessage={scanMessage}
                scanError={scanError}
                onScan={scanWithToken}
              />
            )}
          </div>
        )}
      </AppShellContent>

      {!revealActive && (
        <BottomNav active={view} onNavigate={navigate} hidden={state !== "ready"} />
      )}
    </AppShell>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<PlayerLoadingShell />}>
      <PlayerAccessBoundary />
    </Suspense>
  );
}
