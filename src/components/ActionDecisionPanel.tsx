"use client";

// Decision-driven Storyteller panel for a WAITING_FOR_STORYTELLER operational
// action (audit specs 19 §6/§8/§9). The server derives the legal choices via
// `GET /storyteller/actions/:id/decision`; this component only renders them
// and sends back a typed resolution. Never exposes raw player UUIDs.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  ApiClientError,
  friendlyMessage,
  type ActionDecisionDto,
  type InfoResultDto,
  type StorytellerActionDto,
  type StorytellerPlayerDto,
  type StorytellerResolutionDto,
} from "@/lib/client-api";

/** "WASHERWOMAN" → "Washerwoman", "FORTUNE_TELLER" → "Fortune Teller". */
function titleCaseCharacterId(id: string): string {
  return id
    .split("_")
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

function isInfoResult(value: unknown): value is InfoResultDto {
  if (typeof value !== "object" || value === null) return false;
  return "kind" in value && typeof (value as { kind?: unknown }).kind === "string";
}

/** Readable text for a resolved InfoResult (mirrors the dashboard renderer). */
function infoText(info: InfoResultDto, nameById: Map<string, string>): string {
  switch (info.kind) {
    case "CHARACTER_CANDIDATES":
      return `${titleCaseCharacterId(info.characterId)}: ${info.candidatePlayerIds
        .map((id) => nameById.get(id) ?? id)
        .join(", ")}`;
    case "CHARACTER":
      return `${titleCaseCharacterId(info.characterId)} — ${nameById.get(info.playerId) ?? info.playerId}`;
    case "NUMBER":
      return `Liczba: ${info.value}`;
    case "NO_OUTSIDERS":
      return "brak outsiderów";
    case "DEMON_YES_NO":
      return info.value ? "Tak" : "Nie";
    case "GRIMOIRE":
      return `Pełna lista ról (${info.assignments.length})`;
  }
}

/** Which editor shape is needed to construct a (false) answer. */
type FalseInfoKind =
  | "NUMBER"
  | "DEMON_YES_NO"
  | "CHARACTER"
  | "CHARACTER_CANDIDATES"
  | "NO_OUTSIDERS"
  | "GRIMOIRE";

function falseInfoKindOf(info: unknown, actionKind: string): FalseInfoKind {
  if (isInfoResult(info)) return info.kind;
  // Lazily-resolved info (no precomputed truth): derive from the action kind.
  switch (actionKind) {
    case "RAVENKEEPER_INFO":
    case "UNDERTAKER_INFO":
      return "CHARACTER";
    case "FORTUNE_TELLER_INFO":
      return "DEMON_YES_NO";
    case "CHEF_INFO":
    case "EMPATH_INFO":
      return "NUMBER";
    case "SPY_GRIMOIRE":
      return "GRIMOIRE";
    default:
      return "CHARACTER_CANDIDATES";
  }
}

export default function ActionDecisionPanel({
  gameId,
  action,
  players,
  busy,
  onSubmit,
}: {
  gameId: string;
  action: StorytellerActionDto;
  players: StorytellerPlayerDto[];
  busy: boolean;
  onSubmit: (resolution: StorytellerResolutionDto | undefined) => void;
}) {
  const [decision, setDecision] = useState<ActionDecisionDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // False-answer editor state (all reset whenever the action changes).
  const [numberInput, setNumberInput] = useState("");
  const [yesNo, setYesNo] = useState<boolean | null>(null);
  const [characterId, setCharacterId] = useState("");
  const [characterPlayerId, setCharacterPlayerId] = useState("");
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [note, setNote] = useState("");

  // IMP_KILL decision state.
  const [mayorRedirectId, setMayorRedirectId] = useState("");
  const [starPassId, setStarPassId] = useState("");

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.displayName])), [players]);

  const load = useCallback(async () => {
    setDecision(null);
    setLoadError(null);
    try {
      const next = await api<ActionDecisionDto>(
        `/api/v1/games/${gameId}/storyteller/actions/${action.id}/decision`,
      );
      setDecision(next);
    } catch (err) {
      const e = err as ApiClientError;
      setLoadError(friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się wczytać decyzji."));
    }
  }, [gameId, action.id]);

  useEffect(() => {
    setNumberInput("");
    setYesNo(null);
    setCharacterId("");
    setCharacterPlayerId("");
    setCandidateIds([]);
    setNote("");
    setMayorRedirectId("");
    setStarPassId("");
    void load();
  }, [load]);

  if (loadError) {
    return (
      <div className="mt-2 pl-11">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  if (!decision) {
    return (
      <div className="mt-2 pl-11">
        <p className="text-sm text-ink-muted">Wczytuję decyzję…</p>
      </div>
    );
  }

  if (decision.kind === "IMP_KILL") {
    const successorNeeded = decision.starPass.required && !starPassId;
    const canConfirm = !busy && !successorNeeded;

    function confirmImpKill() {
      const payload: {
        kind: "IMP_KILL";
        mayorRedirectToPlayerId?: string;
        starPassSuccessorPlayerId?: string;
      } = { kind: "IMP_KILL" };
      if (mayorRedirectId) payload.mayorRedirectToPlayerId = mayorRedirectId;
      if (starPassId) payload.starPassSuccessorPlayerId = starPassId;
      onSubmit(payload);
    }

    return (
      <div className="mt-2 flex flex-col gap-3 pl-11">
        <div>
          <p className="text-meta text-moss">Cel Demona</p>
          <p className="mt-0.5 text-sm text-ink-primary">
            {decision.originalTarget?.displayName ?? "—"}
          </p>
        </div>

        {decision.mayorRedirect.available && (
          <label>
            <span className="mb-1 block text-meta text-ink-muted">Przekieruj śmierć (Mayor)</span>
            <select
              value={mayorRedirectId}
              onChange={(e) => setMayorRedirectId(e.target.value)}
              className="min-h-11 w-full max-w-72 rounded-xl border border-line bg-card-soft px-3 text-ink-primary"
            >
              <option value="">Bez przekierowania</option>
              {decision.mayorRedirect.eligibleTargets.map((t) => (
                <option key={t.playerId} value={t.playerId}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </label>
        )}

        {decision.starPass.required && (
          <label>
            <span className="mb-1 block text-meta text-ink-muted">Następca Demona (wymagany)</span>
            <select
              value={starPassId}
              onChange={(e) => setStarPassId(e.target.value)}
              className="min-h-11 w-full max-w-72 rounded-xl border border-line bg-card-soft px-3 text-ink-primary"
            >
              <option value="" disabled>
                — wybierz następcę —
              </option>
              {decision.starPass.eligibleSuccessors.map((s) => (
                <option key={s.playerId} value={s.playerId}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
        {!decision.starPass.required && decision.starPass.eligibleSuccessors.length > 0 && (
          <label>
            <span className="mb-1 block text-meta text-ink-muted">Następca Demona (opcjonalnie)</span>
            <select
              value={starPassId}
              onChange={(e) => setStarPassId(e.target.value)}
              className="min-h-11 w-full max-w-72 rounded-xl border border-line bg-card-soft px-3 text-ink-primary"
            >
              <option value="">— bez następcy —</option>
              {decision.starPass.eligibleSuccessors.map((s) => (
                <option key={s.playerId} value={s.playerId}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={confirmImpKill}
          disabled={!canConfirm}
          className="min-h-11 w-fit rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
        >
          Zatwierdź
        </button>
        {successorNeeded && (
          <p className="text-meta text-ink-muted">Wybierz następcę Demona, aby zatwierdzić.</p>
        )}
      </div>
    );
  }

  // INFO decision.
  const truthfulInfo = isInfoResult(decision.info) ? decision.info : null;
  const falseKind = falseInfoKindOf(decision.info, action.kind);
  const candidateMax =
    truthfulInfo?.kind === "CHARACTER_CANDIDATES" ? truthfulInfo.candidatePlayerIds.length : 2;
  const trimmedCharacterId = characterId.trim();
  const falseMode = decision.requiresFalseInformation;
  const manualEntry = truthfulInfo === null && !falseMode;

  /** Build the typed InfoResult from the editor state, or null when incomplete. */
  function buildFalseValue(): InfoResultDto | null {
    switch (falseKind) {
      case "NUMBER": {
        if (numberInput.trim() === "") return null;
        const value = Number(numberInput);
        if (!Number.isFinite(value)) return null;
        return { kind: "NUMBER", value };
      }
      case "DEMON_YES_NO":
        return yesNo === null ? null : { kind: "DEMON_YES_NO", value: yesNo };
      case "CHARACTER":
        return trimmedCharacterId === "" || !characterPlayerId
          ? null
          : { kind: "CHARACTER", characterId: trimmedCharacterId, playerId: characterPlayerId };
      case "CHARACTER_CANDIDATES":
        return trimmedCharacterId === "" || candidateIds.length !== candidateMax
          ? null
          : {
              kind: "CHARACTER_CANDIDATES",
              characterId: trimmedCharacterId,
              candidatePlayerIds: candidateIds,
            };
      case "NO_OUTSIDERS":
        return note.trim() === "" ? null : { kind: "NO_OUTSIDERS" };
      case "GRIMOIRE":
        return note.trim() === "" ? null : { kind: "GRIMOIRE", assignments: [] };
    }
  }

  function confirmInfo() {
    if (falseMode) {
      const value = buildFalseValue();
      if (value) onSubmit({ kind: "INFO", value });
      return;
    }
    if (truthfulInfo) {
      onSubmit({ kind: "INFO", value: truthfulInfo });
      return;
    }
    // Ravenkeeper requires a Storyteller-supplied character; other lazy kinds
    // (FORTUNE_TELLER_INFO, UNDERTAKER_INFO) are computed server-side.
    if (action.kind === "RAVENKEEPER_INFO") {
      const value = buildFalseValue();
      if (value) onSubmit({ kind: "INFO", value });
      return;
    }
    onSubmit(undefined);
  }

  const needsEditor = falseMode || (manualEntry && action.kind === "RAVENKEEPER_INFO");
  const canConfirm =
    !busy && (needsEditor ? buildFalseValue() !== null : true);

  const editor = (() => {
    switch (falseKind) {
      case "NUMBER":
        return (
          <label>
            <span className="mb-1 block text-meta text-ink-muted">
              {falseMode ? "Fałszywa liczba" : "Liczba"}
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              placeholder="np. 0, 1, 2…"
              autoComplete="off"
              className="min-h-11 w-full max-w-40 rounded-xl border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
            />
          </label>
        );
      case "DEMON_YES_NO":
        return (
          <div>
            <span className="mb-1 block text-meta text-ink-muted">
              {falseMode ? "Fałszywa odpowiedź" : "Odpowiedź"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setYesNo(true)}
                aria-pressed={yesNo === true}
                className={`min-h-11 flex-1 rounded-xl border px-4 text-sm transition-colors ${
                  yesNo === true
                    ? "border-success/50 bg-success/10 text-success"
                    : "border-line text-ink-secondary hover:border-success/40 hover:text-ink-primary"
                }`}
              >
                Tak
              </button>
              <button
                type="button"
                onClick={() => setYesNo(false)}
                aria-pressed={yesNo === false}
                className={`min-h-11 flex-1 rounded-xl border px-4 text-sm transition-colors ${
                  yesNo === false
                    ? "border-danger/50 bg-danger/10 text-danger"
                    : "border-line text-ink-secondary hover:border-danger/40 hover:text-ink-primary"
                }`}
              >
                Nie
              </button>
            </div>
          </div>
        );
      case "CHARACTER":
        return (
          <div className="flex flex-col gap-2">
            <label>
              <span className="mb-1 block text-meta text-ink-muted">
                {falseMode ? "Fałszywa rola" : "Rola"}
              </span>
              <input
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                placeholder="np. washerwoman"
                autoComplete="off"
                className="min-h-11 w-full max-w-64 rounded-xl border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
              />
              {trimmedCharacterId && (
                <span className="mt-1 block text-meta text-ink-muted">
                  → {titleCaseCharacterId(trimmedCharacterId)}
                </span>
              )}
            </label>
            <label>
              <span className="mb-1 block text-meta text-ink-muted">Który gracz</span>
              <select
                value={characterPlayerId}
                onChange={(e) => setCharacterPlayerId(e.target.value)}
                className="min-h-11 w-full max-w-72 rounded-xl border border-line bg-card-soft px-3 text-ink-primary"
              >
                <option value="" disabled>
                  — wybierz gracza —
                </option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        );
      case "CHARACTER_CANDIDATES":
        return (
          <div className="flex flex-col gap-2">
            <label>
              <span className="mb-1 block text-meta text-ink-muted">
                {falseMode ? "Fałszywa rola" : "Rola"}
              </span>
              <input
                value={characterId}
                onChange={(e) => setCharacterId(e.target.value)}
                placeholder="np. washerwoman"
                autoComplete="off"
                className="min-h-11 w-full max-w-64 rounded-xl border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
              />
              {trimmedCharacterId && (
                <span className="mt-1 block text-meta text-ink-muted">
                  → {titleCaseCharacterId(trimmedCharacterId)}
                </span>
              )}
            </label>
            <div>
              <span className="mb-1 block text-meta text-ink-muted">
                Wskazani gracze: {candidateIds.length} / {candidateMax}
              </span>
              <div className="flex max-w-80 flex-col gap-1.5">
                {players.map((p) => {
                  const selected = candidateIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setCandidateIds((prev) => {
                          if (prev.includes(p.id)) return prev.filter((x) => x !== p.id);
                          if (prev.length >= candidateMax) return prev;
                          return [...prev, p.id];
                        })
                      }
                      aria-pressed={selected}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                        selected
                          ? "border-brass bg-brass/15"
                          : "border-line bg-card-soft/60 hover:border-brass/40"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-meta tabular-nums text-ink-secondary">
                        {p.virtualSeat + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-primary">
                        {p.displayName}
                      </span>
                      {selected && (
                        <span className="shrink-0 rounded-full border border-brass/40 bg-brass/10 px-2 py-0.5 text-meta text-ink-primary">
                          wybrano
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      case "NO_OUTSIDERS":
      case "GRIMOIRE":
        return (
          <label>
            <span className="mb-1 block text-meta text-ink-muted">
              {falseMode ? "Fałszywa informacja (notatka)" : "Informacja (notatka)"}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Co przekazać graczowi?"
              rows={3}
              className="min-h-24 w-full max-w-80 rounded-xl border border-line bg-card-soft px-3 py-2 text-ink-primary placeholder:text-ink-muted"
            />
          </label>
        );
    }
  })();

  return (
    <div className="mt-2 flex flex-col gap-3 pl-11">
      {falseMode && (
        <div
          role="alert"
          className="rounded-xl border border-rust/50 bg-rust/10 px-3 py-2.5 text-sm font-semibold text-ink-primary"
        >
          <span aria-hidden="true">[!]</span> NIE DZIAŁA — podaj nieprawdziwą informację
        </div>
      )}

      {truthfulInfo && (
        <div>
          <p className="text-meta text-moss">Prawdziwa odpowiedź</p>
          <p className="mt-0.5 text-sm text-ink-secondary">{infoText(truthfulInfo, nameById)}</p>
        </div>
      )}

      {manualEntry && action.kind === "RAVENKEEPER_INFO" && (
        <div>
          <p className="text-meta text-moss">Podaj odpowiedź (Kruk)</p>
          <p className="mt-0.5 text-meta text-ink-muted">
            Ta informacja wymaga wpisania roli zmarłego gracza.
          </p>
        </div>
      )}

      {manualEntry && action.kind !== "RAVENKEEPER_INFO" && (
        <div>
          <p className="text-meta text-moss">Prawdziwa odpowiedź</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Odpowiedź zostanie wyliczona przy zatwierdzeniu.
          </p>
        </div>
      )}

      {needsEditor && editor}

      <button
        type="button"
        onClick={confirmInfo}
        disabled={!canConfirm}
        className="min-h-11 w-fit rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
      >
        Zatwierdź
      </button>
    </div>
  );
}
