"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  api,
  ApiClientError,
  friendlyMessage,
  type InfoResultDto,
  type StorytellerActionDto,
  type StorytellerGameProjection,
  type StorytellerPlayerDto,
} from "@/lib/client-api";

const MIN_READY = 13;
const MAX_PLAYERS = 16;

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

function isInfoResult(result: unknown): result is InfoResultDto {
  if (typeof result !== "object" || result === null) return false;
  return "kind" in result && typeof (result as { kind?: unknown }).kind === "string";
}

/** Slice 3 wraps ST context as `{ info, functioning }`; unwrap the info. */
function unwrapSecret(secretJson: unknown): unknown {
  if (secretJson && typeof secretJson === "object" && "info" in secretJson) {
    return (secretJson as { info: unknown }).info;
  }
  return secretJson;
}

/** Readable text for a resolved secret (InfoResult or `{ targetPlayerIds }`). */
function resolutionText(result: unknown, nameById: Map<string, string>): string {
  if (isInfoResult(result)) {
    switch (result.kind) {
      case "CHARACTER_CANDIDATES":
        return `${titleCaseCharacterId(result.characterId)}: ${result.candidatePlayerIds
          .map((id) => nameById.get(id) ?? id)
          .join(", ")}`;
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

  const load = useCallback(async () => {
    try {
      const next = await api<StorytellerGameProjection>(`/api/v1/games/${gameId}/storyteller`);
      setGame(next);
      setFatalError(null);
      setStale(false);
    } catch (err) {
      const e = err as ApiClientError;
      setFatalError(friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się wczytać tej sprawy."));
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function handleResolveAction(action: StorytellerActionDto) {
    if (!game) return;
    await runMutation(() =>
      api(`/api/v1/games/${gameId}/storyteller/actions/${action.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: game.version,
          payload: { resolution: unwrapSecret(action.secretJson) },
        }),
      }),
    );
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

  const sorted = game ? [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat) : [];
  const ready = game?.isReady ?? false;
  const need = game ? Math.max(0, MIN_READY - game.participantCount) : 0;
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
              {/* Header card */}
              <section className="card md:col-span-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="display text-xs tracking-[0.25em] text-moss">Akta sprawy</p>
                    <h1 className="display mt-1 break-words text-2xl leading-tight text-ink-primary sm:text-3xl">
                      {game.name}
                    </h1>
                    <p className="mt-1 text-sm text-ink-muted">
                      {statusLabel(game.status)} · {game.participantCount}{" "}
                      {game.participantCount === 1 ? "uczestnik" : "uczestników"}
                    </p>
                  </div>
                  <div className={`rounded-full border px-4 py-2 text-sm font-medium ${gateClassName}`}>
                    {gateText}
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
                                <p className="mt-1 pl-11 text-xs text-rust">czerwony śledź Wróżki</p>
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
                <section className="card md:col-span-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="display text-xs tracking-[0.25em] text-moss">Konfiguracja</p>
                    <span className="rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs text-success">
                      zatwierdzono
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-ink-secondary">
                    Układ ról jest zatwierdzony i zablokowany. Gracze mogą teraz odebrać swoje role.
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
                                <div className="mt-2 pl-11">
                                  <p className="text-xs text-moss">Prawdziwa odpowiedź</p>
                                  {action.secretJson != null ? (
                                    <p className="text-sm text-ink-secondary">
                                      {resolutionText(unwrapSecret(action.secretJson), nameById)}
                                    </p>
                                  ) : (
                                    <p className="text-sm text-ink-muted">
                                      Odpowiedź zostanie wyliczona przy zatwierdzeniu.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleResolveAction(action)}
                                    disabled={busy}
                                    className="mt-2 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
                                  >
                                    Zatwierdź
                                  </button>
                                </div>
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
