"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  api,
  ApiClientError,
  friendlyMessage,
  type DeliveredInfoDto,
  type InfoResultDto,
  type PlayerGameProjection,
  type PlayerScenarioDto,
  type RoleRevealDto,
  type ScanResponseDto,
} from "@/lib/client-api";
import MapCard from "@/components/MapCard";
import PhaseBadge from "@/components/PhaseBadge";
import QrScanner from "@/components/QrScanner";
import { useGameEventStream, type RealtimeHealth } from "@/components/useGameEventStream";
import { usePresenceHeartbeat } from "@/components/usePresenceHeartbeat";
import { characterDisplayName, type CharacterId } from "@/modules/trouble-brewing/characters";

type View = "loading" | "ready" | "unclaimed" | "error";

/**
 * Manual token entry is a development/test affordance only (spec 23 §2.1) —
 * it is absent from the normal production UI.
 */
const DEV_SCAN_INPUT = process.env.NEXT_PUBLIC_DEV_SCAN_INPUT === "1";

function alignmentLabel(alignment: string): string {
  return alignment === "EVIL" ? "Zło" : "Dobro";
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
    default:
      return status;
  }
}

function winnerLabel(winner: string | null): string {
  if (winner === "GOOD") return "Koniec gry — wygrywa dobro";
  if (winner === "EVIL") return "Koniec gry — wygrywa zło";
  return "";
}

function mapVersionLabel(mapVersionId: string | null): string {
  return mapVersionId === "MAP_EXTENDED" ? "Mapa rozszerzona" : "Mapa główna";
}

function taskStateLabel(state: string): string {
  return state === "COMPLETED" ? "ukończono" : "do zrobienia";
}

/** Light realtime dot + short label for the header — text always present. */
function RealtimeDot({ health }: { health: RealtimeHealth }) {
  if (health === "LIVE") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-meta text-moss">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-moss" />
        LIVE
      </span>
    );
  }
  if (health === "RECONNECTING") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-meta text-brass">
        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass" />
        ŁĄCZENIE…
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-meta text-danger">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger" />
      OFFLINE
    </span>
  );
}

/** Friendly summary of a successful QR scan, using refetched titles when known. */
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
    const titles = outcome.discoveries.map(
      (id) => scenario?.clues.find((c) => c.id === id)?.title ?? id,
    );
    parts.push(`Nowe dowody: ${titles.join(", ")}`);
  }
  if (outcome.tasks.length > 0) {
    const titles = outcome.tasks.map(
      (id) => scenario?.tasks.find((t) => t.id === id)?.title ?? id,
    );
    parts.push(`Nowe zadania: ${titles.join(", ")}`);
  }
  if (outcome.mapVersionId) {
    parts.push(
      outcome.mapVersionId === "MAP_EXTENDED"
        ? "Mapa rozszerzona odblokowana — aneks dołączony do akt."
        : "Mapa zaktualizowana.",
    );
  }
  for (const conditionId of outcome.conditions) {
    parts.push(
      conditionId === "INJURED" ? "Jesteś ranny — znajdź apteczkę." : `Stan: ${conditionId}`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : "Skan przyjęty.";
}

function isInfoResult(result: unknown): result is InfoResultDto {
  if (typeof result !== "object" || result === null) return false;
  return "kind" in result && typeof (result as { kind?: unknown }).kind === "string";
}

/** Target-selection actions are the only WAITING_FOR_PLAYER kinds in Slice 2. */
const TARGET_ACTIONS = new Set([
  "POISONER_CHOOSE",
  "FORTUNE_TELLER_CHOOSE",
  "BUTLER_CHOOSE",
  "BUREAUCRAT_CHOOSE",
]);

function requiredTargetCount(kind: string): number | null {
  if (!TARGET_ACTIONS.has(kind)) return null;
  return kind === "FORTUNE_TELLER_CHOOSE" ? 2 : 1;
}

function RoleCard({ role, nameById }: { role: RoleRevealDto; nameById: Map<string, string> }) {
  return (
    <div className="rounded-xl border border-brass/40 bg-elevated p-4">
      <p className="text-meta uppercase tracking-[0.2em] text-ink-muted">Twoja rola</p>
      <p className="display mt-1 text-3xl leading-tight text-ink-primary">
        {characterDisplayName(role.characterId)}
      </p>
      <p className="mt-1 text-sm text-ink-secondary">
        {alignmentLabel(role.alignment)}
        {role.publicCharacter && <span className="text-ink-muted"> · rola publiczna</span>}
      </p>

      {role.teamKnowledge && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-meta uppercase tracking-[0.2em] text-danger">Drużyna Zła</p>
          <p className="mt-1 text-sm text-ink-secondary">
            Demon: {nameById.get(role.teamKnowledge.demonId) ?? role.teamKnowledge.demonId}
          </p>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Minionowie:{" "}
            {role.teamKnowledge.minionIds.length > 0
              ? role.teamKnowledge.minionIds
                  .map((id) => nameById.get(id) ?? id)
                  .join(", ")
              : "—"}
          </p>
        </div>
      )}

      {role.bluffs && role.bluffs.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-card-soft p-3">
          <p className="text-meta uppercase tracking-[0.2em] text-moss">Bluffy Demona</p>
          <p className="mt-1 text-sm text-ink-secondary">
            {role.bluffs.map((id) => characterDisplayName(id as CharacterId)).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

function renderDeliveredInfo(item: DeliveredInfoDto, nameById: Map<string, string>): ReactNode {
  const result = item.result;
  if (isInfoResult(result)) {
    switch (result.kind) {
      case "CHARACTER_CANDIDATES":
        return (
          <>
            <span className="text-ink-secondary">{characterDisplayName(result.characterId)}</span>
            {" — "}
            {result.candidatePlayerIds.map((id) => nameById.get(id) ?? id).join(", ")}
          </>
        );
      case "CHARACTER":
        return <>{characterDisplayName(result.characterId)}</>;
      case "NUMBER":
        return <>Liczba: {result.value}</>;
      case "NO_OUTSIDERS":
        return <>brak outsiderów</>;
      case "DEMON_YES_NO":
        return <>{result.value ? "Tak" : "Nie"}</>;
      case "GRIMOIRE":
        return (
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {[...result.assignments]
              .sort((a, b) => a.virtualSeat - b.virtualSeat)
              .map((a) => (
                <li key={a.playerId} className="text-sm text-ink-secondary">
                  {nameById.get(a.playerId) ?? a.playerId}: {characterDisplayName(a.trueCharacterId)}
                </li>
              ))}
          </ul>
        );
      default:
        return "—";
    }
  }
  if (result && typeof result === "object" && "targetPlayerIds" in result) {
    const ids = (result as { targetPlayerIds?: string[] }).targetPlayerIds ?? [];
    return <>Wybrani: {ids.map((id) => nameById.get(id) ?? id).join(", ")}</>;
  }
  return <span className="text-ink-muted">—</span>;
}

export default function PlayerWaiting() {
  const [view, setView] = useState<View>("loading");
  const [game, setGame] = useState<PlayerGameProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const [revealed, setRevealed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nomineeId, setNomineeId] = useState<string | null>(null);

  const [scanToken, setScanToken] = useState("");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  /** Fetch + store the latest projection. Returns it so callers can react to it. */
  const fetchProjection = useCallback(async (): Promise<PlayerGameProjection> => {
    const next = await api<PlayerGameProjection>("/api/v1/me");
    setGame(next);
    setView("ready");
    setError(null);
    return next;
  }, []);

  const apply = useCallback(async () => {
    try {
      await fetchProjection();
    } catch (err) {
      const e = err as ApiClientError;
      if (e.status === 401 || e.code === "UNAUTHORIZED") {
        setView("unclaimed");
      } else {
        setError(friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się wczytać twojej sprawy."));
        setView("error");
      }
    }
  }, [fetchProjection]);

  const load = useCallback(async () => {
    setView("loading");
    setError(null);
    await apply();
  }, [apply]);

  const refetch = useCallback(async () => {
    await apply();
  }, [apply]);

  const gameId = game?.gameId ?? null;
  const realtime = useGameEventStream(gameId, refetch);
  usePresenceHeartbeat(gameId);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset the target picker whenever the active action changes.
  const activeActionId = game?.activeAction?.id ?? null;
  useEffect(() => {
    setSelectedIds([]);
  }, [activeActionId]);

  async function runMutation(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    setStale(false);
    try {
      await action();
      await refetch();
      return true;
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === "VERSION_CONFLICT") {
        await refetch();
        setStale(true);
      } else {
        setActionError(friendlyMessage(e.code ?? "UNKNOWN", "Coś poszło nie tak."));
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAcknowledgeRole() {
    if (!game) return;
    const ok = await runMutation(() =>
      api(`/api/v1/games/${game.gameId}/role-reveal/ack`, {
        method: "POST",
        body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: game.version }),
      }),
    );
    if (ok) setRevealed(false);
  }

  async function handleSubmitAction() {
    if (!game) return;
    const active = game.activeAction;
    if (!active) return;
    const ok = await runMutation(() =>
      api(`/api/v1/games/${game.gameId}/operational/actions/${active.id}/submit`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { targetPlayerIds: selectedIds },
        }),
      }),
    );
    if (ok) setSelectedIds([]);
  }

  function togglePlayer(id: string, max: number) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  async function handleNominate() {
    if (!game || !nomineeId) return;
    const ok = await runMutation(() =>
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

  async function handleVoteIntent(nominationId: string, intent: boolean) {
    if (!game) return;
    await runMutation(() =>
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
    setActionError(null);
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
      setScanToken("");
      let scenario: PlayerScenarioDto | null = null;
      try {
        scenario = (await fetchProjection()).scenario;
      } catch {
        // Refetch failed — the outcome summary falls back to raw ids.
      }
      setScanMessage(describeScanOutcome(res.outcome, scenario));
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === "VERSION_CONFLICT") {
        await refetch();
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

  const roster = game
    ? [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat)
    : [];
  const nameById = new Map((game?.players ?? []).map((p) => [p.id, p.displayName]));
  const role = game?.myRole ?? null;
  const requiredTargets = game?.activeAction ? requiredTargetCount(game.activeAction.kind) : null;

  const investigation = game?.investigation ?? null;
  const investigationVisible = game ? game.phase === "INVESTIGATION" : false;
  const candidateId = investigation?.currentExecutionCandidatePlayerId ?? null;
  const candidateName = candidateId ? (nameById.get(candidateId) ?? candidateId) : null;
  const livingOthers = game
    ? game.players.filter((p) => p.alive && p.id !== game.me.playerId)
    : [];
  const votingNominations = game ? game.nominations.filter((n) => n.status === "VOTING") : [];
  const resolvedNominations = game
    ? game.nominations.filter((n) => n.status === "LOCKED" || n.status === "RESOLVED")
    : [];
  const scenario = game?.scenario ?? null;
  const scenarioVisible = game ? game.phase === "INVESTIGATION" && scenario !== null : false;

  // A formal flow is underway when a decision is expected from someone in the
  // circle: an operational action is pending, or a voting pass is running.
  const formalFlow =
    game !== null &&
    (game.activeAction !== null ||
      game.nominations.some((n) => n.status === "VOTING" && n.passStatus === "RUNNING"));
  const connectionBlocked = formalFlow && realtime !== "LIVE";

  // Track newly discovered clues so only genuinely new evidence cards play the
  // one-shot dossier-insertion animation (docs/11 §13) — refetches of the
  // existing list never re-animate.
  const clueIdsKey = scenario?.clues.map((c) => c.id).join("|") ?? "";
  const seenClueIdsRef = useRef<Set<string> | null>(null);
  const [enteringClueIds, setEnteringClueIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (clueIdsKey === "") {
      seenClueIdsRef.current = null;
      setEnteringClueIds(new Set());
      return;
    }
    const current = new Set(clueIdsKey.split("|"));
    const prev = seenClueIdsRef.current;
    if (prev === null) {
      seenClueIdsRef.current = current;
      return;
    }
    const fresh = new Set<string>();
    for (const id of current) {
      if (!prev.has(id)) fresh.add(id);
    }
    seenClueIdsRef.current = current;
    if (fresh.size > 0) setEnteringClueIds(fresh);
  }, [clueIdsKey]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="display text-sm tracking-[0.3em] text-moss">
            The Sieś Files
          </Link>
          <div className="flex items-center gap-3">
            {game && <PhaseBadge phase={game.phase} status={game.status} />}
            {game && <RealtimeDot health={realtime} />}
            <span className="text-meta text-ink-muted">Gracz</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {view === "loading" && (
          <p className="py-12 text-center text-ink-muted">Wczytuję twoją sprawę…</p>
        )}

        {view === "error" && (
          <div className="card critical-card mx-auto max-w-md text-center">
            <p className="text-danger">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass hover:bg-brass/20"
            >
              Spróbuj ponownie
            </button>
          </div>
        )}

        {view === "unclaimed" && (
          <div className="card mx-auto max-w-md text-center">
            <p className="display text-meta tracking-[0.25em] text-moss">Tożsamość</p>
            <p className="mt-3 text-base text-ink-primary">
              Nie odebrano jeszcze twojej tożsamości — otwórz link do odbioru.
            </p>
            <Link
              href="/claim"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass hover:bg-brass/20"
            >
              Mam link do odbioru
            </Link>
          </div>
        )}

        {view === "ready" && game && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {connectionBlocked && (
              <div
                role="alert"
                aria-live="polite"
                className="flex min-h-11 items-center rounded-xl border border-brass/40 bg-brass/10 px-4 py-3 text-sm text-brass md:col-span-3"
              >
                Brak połączenia — odświeżanie…
              </div>
            )}

            {(stale || actionError) && (
              <div className="flex flex-col gap-2 md:col-span-3">
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

            {/* Persistent terminal result (authoritative, survives reload) */}
            {game.result && (
              <section
                className={`card md:col-span-3 ${
                  game.result.winner === "EVIL"
                    ? "border-danger/40 bg-danger/10"
                    : "border-success/40 bg-success/10"
                }`}
              >
                <p className="display text-meta tracking-[0.25em] text-ink-muted">Wynik sprawy</p>
                <h2 className="display mt-1 text-2xl leading-tight text-ink-primary">
                  {winnerLabel(game.result.winner)}
                </h2>
                {game.result.reason && (
                  <p className="mt-1 text-sm text-ink-secondary">{game.result.reason}</p>
                )}
              </section>
            )}

            {/* Role reveal gate */}
            {role && !game.roleAcknowledged && (
              <section className="card secret-card md:col-span-3">
                <p className="display text-meta tracking-[0.25em] text-brass">Informacje prywatne</p>
                {!revealed ? (
                  <div className="mt-3">
                    <p className="text-sm text-ink-secondary">
                      Twoja rola jest prywatna. Upewnij się, że nikt nie patrzy na ekran.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRevealed(true)}
                      className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20"
                    >
                      Pokaż rolę
                    </button>
                  </div>
                ) : (
                  <div className="role-reveal mt-3">
                    <RoleCard role={role} nameById={nameById} />
                    <button
                      type="button"
                      onClick={handleAcknowledgeRole}
                      disabled={busy}
                      className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                    >
                      Potwierdź
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Operational action — current action sits first, full width (docs/11 §6) */}
            {game.activeAction && (
              <section className="card md:col-span-3">
                <p className="display text-meta tracking-[0.25em] text-moss">Działanie</p>
                <h2 className="display mt-2 text-xl leading-tight text-ink-primary">
                  {characterDisplayName(game.activeAction.kind)}
                </h2>

                {requiredTargets === null ? (
                  <p className="mt-3 text-sm text-ink-secondary">
                    Czekam na rozstrzygnięcie Mistrza Gry…
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-sm text-ink-secondary">
                      Wybierz graczy: {selectedIds.length} / {requiredTargets}
                    </p>
                    <ol className="mt-3 flex flex-col gap-2">
                      {roster.map((player) => {
                        const selected = selectedIds.includes(player.id);
                        const isSelf = player.id === game.me.playerId;
                        return (
                          <li key={player.id}>
                            <button
                              type="button"
                              onClick={() => togglePlayer(player.id, requiredTargets)}
                              aria-pressed={selected}
                              className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                                selected
                                  ? "border-brass bg-brass/15"
                                  : "border-line bg-card-soft/60 hover:border-brass/40"
                              }`}
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                                {player.virtualSeat + 1}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-base text-ink-primary">
                                {player.displayName}
                              </span>
                              {isSelf && (
                                <span className="shrink-0 rounded-full border border-moss/40 bg-moss/10 px-2.5 py-0.5 text-meta text-moss">
                                  ty
                                </span>
                              )}
                              {selected && (
                                <span className="shrink-0 rounded-full border border-brass/40 bg-brass/10 px-2.5 py-0.5 text-meta text-ink-primary">
                                  wybrano
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                    <button
                      type="button"
                      onClick={handleSubmitAction}
                      disabled={busy || selectedIds.length !== requiredTargets || connectionBlocked}
                      className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                    >
                      Złóż działanie
                    </button>
                  </>
                )}
              </section>
            )}

            {/* Identity card */}
            <section className="card md:col-span-1">
              <p className="display text-meta tracking-[0.25em] text-moss">Ty</p>
              <h1 className="display mt-2 break-words text-2xl leading-tight text-ink-primary">
                {game.me.displayName}
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                Miejsce {game.me.virtualSeat + 1} w Wirtualnym Kręgu
              </p>

              {role && game.roleAcknowledged && (
                <div className="mt-4 rounded-xl border border-brass/40 bg-elevated p-3">
                  <p className="text-meta uppercase tracking-[0.2em] text-ink-muted">Twoja rola</p>
                  <p className="display mt-1 text-xl leading-tight text-ink-primary">
                    {characterDisplayName(role.characterId)}
                  </p>
                  <p className="mt-1 text-sm text-ink-secondary">{alignmentLabel(role.alignment)}</p>
                  <p className="mt-2 text-meta text-success">rola potwierdzona</p>
                </div>
              )}
              {!role && (
                <p className="mt-4 rounded-lg border border-line bg-card-soft px-3 py-2 text-sm text-ink-secondary">
                  Czekamy na rozpoczęcie sprawy.
                </p>
              )}
            </section>

            {/* Roster card */}
            <section className="card md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="display text-meta tracking-[0.25em] text-moss">Wirtualny Krąg</p>
                <span className="text-meta text-ink-muted">
                  {game.participantCount} osób · {game.name}
                </span>
              </div>

              <ol className="mt-3 flex flex-col gap-2">
                {roster.map((player) => (
                  <li
                    key={player.id}
                    className="flex items-center gap-3 rounded-xl border border-line bg-card-soft/60 px-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                      {player.virtualSeat + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base text-ink-primary">
                      {player.displayName}
                    </span>
                    {player.id === game.me.playerId && (
                      <span className="shrink-0 rounded-full border border-moss/40 bg-moss/10 px-2.5 py-0.5 text-meta text-moss">
                        ty
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            {/* Delivered info */}
            {game.deliveredInfo.length > 0 && (
              <section className="card md:col-span-3">
                <p className="display text-meta tracking-[0.25em] text-moss">Otrzymane informacje</p>
                <ol className="mt-3 flex flex-col gap-2">
                  {game.deliveredInfo.map((item) => (
                    <li key={item.actionId} className="rounded-xl border border-line bg-card-soft/60 p-3">
                      <p className="text-meta text-ink-muted">{characterDisplayName(item.kind)}</p>
                      <div className="mt-1 text-sm text-ink-primary">
                        {renderDeliveredInfo(item, nameById)}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Investigation */}
            {investigationVisible && (
              <section className="card md:col-span-3">
                <p className="display text-meta tracking-[0.25em] text-moss">Śledztwo</p>

                <div className="mt-3 rounded-xl border border-line bg-card-soft/60 p-3">
                  <p className="text-meta text-moss">Kandydat do egzekucji</p>
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

                {!game.me.alive && (
                  <p className="mt-2 text-meta text-ink-muted">
                    Jesteś martwy — głosujesz jako duch
                    {game.me.ghostVoteAvailable ? " (głos ducha dostępny)" : " (głos ducha zużyty)"}.
                  </p>
                )}

                {investigation?.nominationState === "OPEN" && (
                  <div className="mt-4">
                    <p className="text-sm text-ink-secondary">Kogo nominujesz?</p>
                    {livingOthers.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-muted">
                        Brak żywych graczy do nominowania.
                      </p>
                    ) : (
                      <>
                        <ol className="mt-2 flex flex-col gap-2">
                          {livingOthers.map((player) => {
                            const selected = nomineeId === player.id;
                            return (
                              <li key={player.id}>
                                <button
                                  type="button"
                                  onClick={() => setNomineeId(selected ? null : player.id)}
                                  aria-pressed={selected}
                                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                                    selected
                                      ? "border-brass bg-brass/15"
                                      : "border-line bg-card-soft/60 hover:border-brass/40"
                                  }`}
                                >
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-sm tabular-nums text-ink-secondary">
                                    {player.virtualSeat + 1}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-base text-ink-primary">
                                    {player.displayName}
                                  </span>
                                  {selected && (
                                    <span className="shrink-0 rounded-full border border-brass/40 bg-brass/10 px-2.5 py-0.5 text-meta text-ink-primary">
                                      wybrano
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                        <button
                          type="button"
                          onClick={handleNominate}
                          disabled={busy || !nomineeId || !game.me.alive}
                          className="mt-3 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                        >
                          Nominuj
                        </button>
                        {!game.me.alive && (
                          <p className="mt-1 text-meta text-ink-muted">
                            Martwi gracze nie mogą nominować.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {votingNominations.length > 0 && (
                  <div className="mt-4">
                    <p className="text-meta text-moss">Głosowanie</p>
                    <div className="mt-2 flex flex-col gap-2">
                      {votingNominations.map((n) => {
                        const yesActive = n.myVoteIntent === true;
                        const noActive = n.myVoteIntent === false;
                        const isMyTurn =
                          n.passStatus === "RUNNING" &&
                          n.currentVirtualSeat === game.me.virtualSeat;
                        const currentVoter =
                          n.currentVirtualSeat != null
                            ? (roster.find((p) => p.virtualSeat === n.currentVirtualSeat) ?? null)
                            : null;
                        return (
                          <div
                            key={n.id}
                            className="rounded-xl border border-line bg-card-soft/60 p-3"
                          >
                            <p className="text-sm text-ink-primary">
                              {n.nominatorName ?? "—"} → {n.nomineeName ?? "—"}
                            </p>

                            {isMyTurn ? (
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleVoteIntent(n.id, true)}
                                  disabled={busy || connectionBlocked}
                                  aria-pressed={yesActive}
                                  className={`min-h-11 flex-1 rounded-xl border px-4 text-sm transition-colors disabled:opacity-50 ${
                                    yesActive
                                      ? "border-success/50 bg-success/10 text-success"
                                      : "border-line text-ink-secondary hover:border-success/40 hover:text-ink-primary"
                                  }`}
                                >
                                  Tak
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleVoteIntent(n.id, false)}
                                  disabled={busy || connectionBlocked}
                                  aria-pressed={noActive}
                                  className={`min-h-11 flex-1 rounded-xl border px-4 text-sm transition-colors disabled:opacity-50 ${
                                    noActive
                                      ? "border-danger/50 bg-danger/10 text-danger"
                                      : "border-line text-ink-secondary hover:border-danger/40 hover:text-ink-primary"
                                  }`}
                                >
                                  Nie
                                </button>
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-ink-secondary">
                                {n.passStatus === "RUNNING"
                                  ? `Czekaj na swoją kolej — głosuje: ${currentVoter?.displayName ?? "—"}`
                                  : n.passStatus === "READY"
                                    ? "Głosowanie czeka na rozpoczęcie przez Mistrza Gry."
                                    : "Głosowanie zakończone — czekaj na zamknięcie."}
                              </p>
                            )}

                            {n.myVoteIntent !== null && (
                              <p className="mt-1.5 text-meta text-ink-muted">
                                Twój głos:{" "}
                                <span className="text-ink-secondary">
                                  {n.myVoteIntent ? "Tak" : "Nie"}
                                </span>
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {resolvedNominations.length > 0 && (
                  <div className="mt-4">
                    <p className="text-meta text-moss">Rozstrzygnięte nominacje</p>
                    <div className="mt-2 flex flex-col gap-2">
                      {resolvedNominations.map((n) => (
                        <div
                          key={n.id}
                          className="rounded-xl border border-line bg-card-soft/60 p-3"
                        >
                          <p className="text-sm text-ink-primary">
                            {n.nominatorName ?? "—"} → {n.nomineeName ?? "—"}
                          </p>
                          <p className="mt-1 flex items-center gap-2 text-meta">
                            <span className="text-ink-muted">
                              {nominationStatusLabel(n.status)} · {n.effectiveTotal} głosów
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 ${
                                n.qualified
                                  ? "border-success/40 text-success"
                                  : "border-line text-ink-muted"
                              }`}
                            >
                              {n.qualified ? "kandydat" : "nie przeszedł"}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Scenario */}
            {scenarioVisible && scenario && (
              <section className="md:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="display text-meta tracking-[0.25em] text-moss">Scenariusz</p>
                  <span className="text-meta text-ink-muted">etap: {scenario.stageId ?? "—"}</span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {/* Evidence */}
                  <div className="card paper-card md:col-span-2">
                    <p className="display text-meta tracking-[0.25em] text-ink">Dowody</p>
                    {scenario.clues.length === 0 ? (
                      <p className="mt-3 text-sm text-ink/70">Brak dowodów</p>
                    ) : (
                      <ol className="mt-3 flex flex-col gap-2">
                        {scenario.clues.map((clue) => (
                          <li
                            key={clue.id}
                            className={`rounded-xl border border-ink/15 bg-ink/5 p-3 ${
                              enteringClueIds.has(clue.id) ? "card-in" : ""
                            }`}
                          >
                            <p className="text-sm font-semibold text-ink">{clue.title}</p>
                            <p className="mt-1 text-sm text-ink/75">{clue.body}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  {/* Tasks */}
                  <div className="card md:col-span-1">
                    <p className="display text-meta tracking-[0.25em] text-moss">Zadania</p>
                    {scenario.tasks.length === 0 ? (
                      <p className="mt-3 text-sm text-ink-muted">Brak zadań</p>
                    ) : (
                      <ol className="mt-3 flex flex-col gap-2">
                        {scenario.tasks.map((task) => {
                          const done = task.state === "COMPLETED";
                          return (
                            <li
                              key={task.id}
                              className="rounded-xl border border-line bg-card-soft/60 p-3"
                            >
                              <p className="text-sm text-ink-primary">{task.title}</p>
                              <p className={`mt-1 text-meta ${done ? "text-success" : "text-brass"}`}>
                                {taskStateLabel(task.state)}
                              </p>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>

                  {/* Map */}
                  <div className="card map-card md:col-span-2">
                    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                      <p className="display text-meta tracking-[0.25em] text-moss">Mapa</p>
                      <span className="text-meta text-ink-muted">
                        {mapVersionLabel(scenario.mapVersionId)}
                      </span>
                    </div>
                    <MapCard
                      mapVersionId={scenario.mapVersionId}
                      mapLocations={scenario.mapLocations}
                    />
                  </div>

                  {/* Scanner */}
                  <div className="card md:col-span-1">
                    <p className="display text-meta tracking-[0.25em] text-moss">Skaner</p>
                    <p className="mt-2 text-meta text-ink-muted">
                      Skanuj kody QR znalezione na terenie śledztwa.
                    </p>
                    <div className="mt-3">
                      <QrScanner onScan={scanWithToken} />
                    </div>
                    {DEV_SCAN_INPUT && (
                      <div className="mt-4 border-t border-line pt-3">
                        <p className="text-meta text-ink-muted">Tryb deweloperski</p>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const token = scanToken.trim();
                            if (!token || busy) return;
                            void scanWithToken(token);
                          }}
                          className="mt-2 flex flex-col gap-2"
                        >
                          <label htmlFor="qr-token" className="sr-only">
                            Kod QR
                          </label>
                          <input
                            id="qr-token"
                            value={scanToken}
                            onChange={(e) => setScanToken(e.target.value)}
                            placeholder="Wpisz kod QR"
                            autoComplete="off"
                            className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
                          />
                          <button
                            type="submit"
                            disabled={busy || !scanToken.trim()}
                            className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                          >
                            Skanuj
                          </button>
                        </form>
                      </div>
                    )}
                    {scanMessage && (
                      <p
                        role="status"
                        className="mt-3 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
                      >
                        {scanMessage}
                      </p>
                    )}
                    {scanError && (
                      <p
                        role="alert"
                        className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                      >
                        {scanError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Scenario-only condition warning (no game effect) */}
                {scenario.conditions.includes("INJURED") && (
                  <div
                    role="status"
                    className="mt-3 flex min-h-11 items-center rounded-xl border border-rust/50 bg-rust/10 px-4 py-3 text-sm text-ink-primary"
                  >
                    Jesteś ranny — znajdź apteczkę.
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
