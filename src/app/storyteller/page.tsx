"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  ApiClientError,
  friendlyMessage,
  type StorytellerGameProjection,
} from "@/lib/client-api";

type View = "loading" | "form" | "creating" | "error";

export default function StorytellerHome() {
  const router = useRouter();
  const [view, setView] = useState<View>("loading");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function reopenOrShowForm() {
      try {
        const current = await api<{ gameId: string | null }>("/api/v1/storyteller/current");
        if (cancelled) return;
        if (current.gameId) {
          router.replace(`/storyteller/${current.gameId}`);
        } else {
          setView("form");
        }
      } catch (err) {
        if (cancelled) return;
        const e = err as ApiClientError;
        setError(friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się sprawdzić otwartej sprawy."));
        setView("error");
      }
    }

    void reopenOrShowForm();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nadaj sprawie nazwę, zanim ją otworzysz.");
      return;
    }

    setView("creating");
    setError(null);
    try {
      const game = await api<StorytellerGameProjection>("/api/v1/games", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      router.replace(`/storyteller/${game.gameId}`);
    } catch (err) {
      const e = err as ApiClientError;
      setError(friendlyMessage(e.code ?? "UNKNOWN", "Nie udało się otworzyć sprawy."));
      setView("form");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="display text-sm tracking-[0.3em] text-moss">
            The Sieś Files
          </Link>
          <span className="text-meta text-ink-muted">Storyteller</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        {view === "loading" && (
          <p className="text-center text-ink-muted">Sprawdzam akta sprawy…</p>
        )}

        {view === "error" && (
          <div className="card critical-card text-center">
            <p className="text-danger">{error}</p>
            <button
              type="button"
              onClick={() => {
                setView("loading");
                setError(null);
                void api<{ gameId: string | null }>("/api/v1/storyteller/current")
                  .then((c) => (c.gameId ? router.replace(`/storyteller/${c.gameId}`) : setView("form")))
                  .catch((err: ApiClientError) => {
                    setError(friendlyMessage(err.code ?? "UNKNOWN", "Nie udało się sprawdzić otwartej sprawy."));
                    setView("error");
                  });
              }}
              className="mt-4 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-5 text-brass hover:bg-brass/20"
            >
              Spróbuj ponownie
            </button>
          </div>
        )}

        {(view === "form" || view === "creating") && (
          <div className="card">
            <p className="display text-meta tracking-[0.25em] text-moss">Nowe akta sprawy</p>
            <h1 className="display mt-2 text-2xl leading-tight text-ink-primary">
              Otwórz sprawę
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Nazwij to śledztwo. Następnie dodasz 13–16 uczestników i ustawisz ich w Wirtualnym
              Kręgu.
            </p>

            <form onSubmit={handleCreate} className="mt-5 flex flex-col gap-3">
              <label htmlFor="game-name" className="sr-only">
                Nazwa sprawy
              </label>
              <input
                id="game-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Sieś Files — 2026"
                autoComplete="off"
                className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                type="submit"
                disabled={view === "creating"}
                className="min-h-12 rounded-xl border border-brass/60 bg-brass/10 px-5 text-ink-primary transition-colors hover:bg-brass/20 disabled:opacity-50"
              >
                {view === "creating" ? "Otwieram…" : "Otwórz sprawę"}
              </button>
            </form>
          </div>
        )}

        {(view === "error" || view === "form" || view === "creating") && <RecoverAccess />}
      </main>
    </div>
  );
}

/** Discreet storyteller access recovery (audit spec 21 §7) — never echoes the secret. */
function RecoverAccess() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gameId, setGameId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedId = gameId.trim();
    if (!trimmedId || !secret.trim()) return;
    setBusy(true);
    setFailed(false);
    try {
      await api("/api/v1/storyteller/recover", {
        method: "POST",
        body: JSON.stringify({ gameId: trimmedId, recoverySecret: secret }),
      });
      router.replace(`/storyteller/${trimmedId}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-11 rounded-xl px-3 text-sm text-ink-muted underline-offset-2 hover:text-ink-primary hover:underline"
      >
        Odzyskaj dostęp Storytellera
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 flex flex-col gap-2 rounded-xl border border-line bg-card-soft/60 p-3"
        >
          <label htmlFor="recover-game-id" className="sr-only">
            Identyfikator sprawy
          </label>
          <input
            id="recover-game-id"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="ID sprawy"
            autoComplete="off"
            className="min-h-11 w-full rounded-xl border border-line bg-elevated px-3 font-mono text-sm text-ink-primary placeholder:text-ink-muted"
          />
          <label htmlFor="recover-secret" className="sr-only">
            Sekret odzyskiwania
          </label>
          <input
            id="recover-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Sekret odzyskiwania"
            autoComplete="off"
            className="min-h-11 w-full rounded-xl border border-line bg-elevated px-3 text-ink-primary placeholder:text-ink-muted"
          />
          {failed && (
            <p role="alert" className="text-sm text-danger">
              Nie udało się odzyskać dostępu.
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !gameId.trim() || !secret.trim()}
            className="min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20 disabled:opacity-50"
          >
            {busy ? "Odzyskuję…" : "Odzyskaj"}
          </button>
        </form>
      )}
    </div>
  );
}
