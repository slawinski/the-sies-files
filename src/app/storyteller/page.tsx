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
          <span className="text-xs text-ink-muted">Storyteller</span>
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
            <p className="display text-xs tracking-[0.25em] text-moss">Nowe akta sprawy</p>
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
      </main>
    </div>
  );
}
