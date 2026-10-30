"use client";

// /player — controller layer (spec 19 §6.1). Fetches the projection, owns the
// event stream and mutations, resolves the view from the URL, and delegates
// rendering to the view components. No card/button styling lives here.

import { Suspense, useCallback, useEffect, useState } from "react";
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

type View = "loading" | "ready" | "unclaimed" | "error";

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

function PlayerPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawView = searchParams.get("view");
  const view: PlayerView = isPlayerView(rawView) ? rawView : "case";

  const [state, setState] = useState<View>("loading");
  const [game, setGame] = useState<PlayerGameProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nomineeId, setNomineeId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const fetchProjection = useCallback(async (): Promise<PlayerGameProjection> => {
    const next = await api<PlayerGameProjection>("/api/v1/me");
    setGame(next);
    setState("ready");
    setError(null);
    return next;
  }, []);

  const apply = useCallback(async () => {
    try {
      await fetchProjection();
    } catch (err) {
      const e = err as ApiClientError;
      if (e.status === 401 || e.code === "UNAUTHORIZED") {
        setState("unclaimed");
      } else {
        setError(friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się wczytać twojej sprawy."));
        setState("error");
      }
    }
  }, [fetchProjection]);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    await apply();
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  const gameId = game?.gameId ?? null;
  const realtime = useGameEventStream(gameId, () => void apply());
  usePresenceHeartbeat(gameId);
  const { busy, actionError, stale, setBusy, setActionError, setStale, run } =
    useVersionedMutation(apply);

  // Reset the target picker whenever the active action changes.
  const activeActionId = game?.activeAction?.id ?? null;
  useEffect(() => {
    setSelectedIds([]);
  }, [activeActionId]);

  async function handleAcknowledgeRole() {
    if (!game) return;
    await run(() =>
      api(`/api/v1/games/${game.gameId}/role-reveal/ack`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
  }

  async function handleSubmitAction() {
    if (!game?.activeAction) return;
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
    if (!game || !nomineeId) return;
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
    if (!game) return;
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
    if (!game) return;
    setBusy(true);
    setScanMessage(null);
    setScanError(null);
    setStale(false);
    try {
      const res = await api<ScanResponseDto>(`/api/v1/games/${game.gameId}/scenario/qr/scan`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { token },
        }),
      });
      let scenario: PlayerScenarioDto | null = null;
      try {
        scenario = (await fetchProjection()).scenario;
      } catch {
        // Refetch failed — the outcome summary keeps generic wording.
      }
      setScanMessage(describeScanOutcome(res.outcome, scenario));
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === "VERSION_CONFLICT") {
        await apply();
        setStale(true);
      } else if (e.code === "TERRAIN_UNAVAILABLE") {
        setScanError(
          "Teren niedostępny — skanowanie możliwe tylko podczas śledztwa, poza formalnymi nominacjami.",
        );
      } else if (e.code === "QR_ALREADY_CONSUMED") {
        setScanError("Ten kod został już wykorzystany.");
      } else {
        setActionError(friendlyMessage(e.code ?? "UNKNOWN", "Coś poszło nie tak."));
      }
    } finally {
      setBusy(false);
    }
  }

  function navigate(next: PlayerView) {
    const url = next === "case" ? "/player" : `/player?view=${next}`;
    router.replace(url, { scroll: false });
  }

  const mode = game ? selectPlayerPresentation(game) : null;
  const revealActive = mode === "ROLE_REVEAL";
  const formal = mode === "FORMAL_VOTING" || mode === "FORMAL_NOMINATION";
  const connectionBlocked =
    game !== null &&
    realtime !== "LIVE" &&
    (game.activeAction !== null ||
      game.nominations.some((n) => n.status === "VOTING" && n.passStatus === "RUNNING"));

  const headerMode = mode === "GAME_ENDED" ? "critical" : formal ? "formal" : "quiet";
  const sortedRoster = game ? [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat) : [];
  const votingNomination = game ? selectActiveVotingNomination(game) : null;

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
            {stale && (
              <Notice variant="warning">
                Ta sprawa zmieniła się w innej karcie — widok został odświeżony. Ponów ostatnią
                akcję.
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

            {game.scenario?.conditions.includes("INJURED") && (
              <Notice variant="warning">Jesteś ranny — znajdź apteczkę.</Notice>
            )}

            {view === "case" && (
              <PlayerCaseView
                game={game}
                selectedIds={selectedIds}
                onToggleTarget={(id) => {
                  const active = game.activeAction;
                  if (!active) return;
                  const max = requiredTargetCount(active.kind);
                  if (max !== null) toggleTarget(id, max);
                }}
                onSubmitAction={() => void handleSubmitAction()}
                busy={busy}
                connectionBlocked={connectionBlocked}
                nomineeId={nomineeId}
                onSelectNominee={setNomineeId}
                onSubmitNomination={() => void handleNominate()}
                onVote={(id, intent) => void handleVote(id, intent)}
                onAcknowledgeRole={() => void handleAcknowledgeRole()}
                onNavigate={navigate}
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
                busy={busy}
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
      <PlayerPageInner />
    </Suspense>
  );
}
