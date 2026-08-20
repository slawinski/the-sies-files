"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  ApiClientError,
  friendlyMessage,
  type PlayerGameProjection,
} from "@/lib/client-api";

type View = "loading" | "ready" | "unclaimed" | "error";

export default function PlayerWaiting() {
  const [view, setView] = useState<View>("loading");
  const [game, setGame] = useState<PlayerGameProjection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setView("loading");
    setError(null);
    try {
      const next = await api<PlayerGameProjection>("/api/v1/me");
      setGame(next);
      setView("ready");
    } catch (err) {
      const e = err as ApiClientError;
      if (e.status === 401 || e.code === "UNAUTHORIZED") {
        setView("unclaimed");
      } else {
        setError(friendlyMessage(e.code ?? "UNKNOWN", "Couldn't load your case."));
        setView("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roster = game
    ? [...game.players].sort((a, b) => a.virtualSeat - b.virtualSeat)
    : [];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="display text-sm tracking-[0.3em] text-moss">
            The Sieś Files
          </Link>
          <span className="text-xs text-ink-muted">Player</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {view === "loading" && (
          <p className="py-12 text-center text-ink-muted">Loading your case…</p>
        )}

        {view === "error" && (
          <div className="card critical-card mx-auto max-w-md text-center">
            <p className="text-danger">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass hover:bg-brass/20"
            >
              Try again
            </button>
          </div>
        )}

        {view === "unclaimed" && (
          <div className="card mx-auto max-w-md text-center">
            <p className="display text-xs tracking-[0.25em] text-moss">Identity</p>
            <p className="mt-3 text-base text-ink-primary">
              You haven&apos;t claimed your identity yet — open your claim link.
            </p>
            <Link
              href="/claim"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass hover:bg-brass/20"
            >
              I have a claim link
            </Link>
          </div>
        )}

        {view === "ready" && game && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Identity card */}
            <section className="card md:col-span-1">
              <p className="display text-xs tracking-[0.25em] text-moss">You</p>
              <h1 className="display mt-2 break-words text-2xl leading-tight text-ink-primary">
                {game.me.displayName}
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                Seat {game.me.virtualSeat + 1} in the Virtual Circle
              </p>
              <p className="mt-4 rounded-lg border border-line bg-card-soft px-3 py-2 text-sm text-ink-secondary">
                Waiting for the case to begin.
              </p>
            </section>

            {/* Roster card */}
            <section className="card md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="display text-xs tracking-[0.25em] text-moss">Virtual Circle</p>
                <span className="text-xs text-ink-muted">
                  {game.participantCount} seated · {game.name}
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
                      <span className="shrink-0 rounded-full border border-moss/40 bg-moss/10 px-2.5 py-0.5 text-xs text-moss">
                        you
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
