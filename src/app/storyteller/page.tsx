"use client";

// Storyteller entry — open a case or resume the current one (audit 18 §7).
// Polish copy first; the "Storyteller" role is explained, not assumed.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiClientError, friendlyMessage, type StorytellerGameProjection } from "@/lib/client-api";
import AppShell, { AppShellContent } from "@/components/ui/AppShell";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";

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
    <AppShell>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-[11px] uppercase tracking-[0.3em] text-moss">
            The Sieś Files
          </Link>
          <span className="text-meta text-ink-muted">Prowadzący</span>
        </div>
      </header>

      <AppShellContent>
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          {view === "loading" && (
            <p className="text-center text-ink-muted">Sprawdzam akta sprawy…</p>
          )}

          {view === "error" && (
            <div className="flex flex-col gap-3">
              <Notice variant="error">{error}</Notice>
              <Button
                fullWidth
                onClick={() => {
                  setView("loading");
                  setError(null);
                  void api<{ gameId: string | null }>("/api/v1/storyteller/current")
                    .then((c) =>
                      c.gameId ? router.replace(`/storyteller/${c.gameId}`) : setView("form"),
                    )
                    .catch((err: ApiClientError) => {
                      setError(
                        friendlyMessage(
                          err.code ?? "UNKNOWN",
                          "Nie udało się sprawdzić otwartej sprawy.",
                        ),
                      );
                      setView("error");
                    });
                }}
              >
                Spróbuj ponownie
              </Button>
            </div>
          )}

          {(view === "form" || view === "creating") && (
            <Surface variant="system">
              <p className="eyebrow">Nowe akta sprawy</p>
              <h1 className="display mt-2 text-2xl leading-tight text-ink-primary">
                Otwórz sprawę
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                Nazwij to śledztwo. Następnie dodasz 13–16 uczestników i ustawisz ich w Wirtualnym
                Kręgu, a na koniec zatwierdzisz tajny układ ról.
              </p>

              <form onSubmit={handleCreate} className="mt-5 flex flex-col gap-3">
                <label htmlFor="game-name" className="sr-only">
                  Nazwa sprawy
                </label>
                <input
                  id="game-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="The Sieś Files — 2026"
                  autoComplete="off"
                  className="min-h-12 w-full rounded-control border border-line bg-card-soft px-3 text-ink-primary placeholder:text-ink-muted"
                />
                {error && <Notice variant="error">{error}</Notice>}
                <Button type="submit" fullWidth size="lg" busy={view === "creating"}>
                  {view === "creating" ? "Otwieram…" : "Otwórz sprawę"}
                </Button>
              </form>
            </Surface>
          )}

          {(view === "error" || view === "form" || view === "creating") && <RecoverAccess />}
        </div>
      </AppShellContent>
    </AppShell>
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
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-11 rounded-control px-3 text-sm text-ink-muted underline-offset-2 hover:text-ink-primary hover:underline"
      >
        Odzyskaj dostęp prowadzącego
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-3 flex flex-col gap-2 rounded-tile border border-line bg-card-soft/60 p-3"
        >
          <label htmlFor="recover-game-id" className="sr-only">
            Identyfikator sprawy
          </label>
          <input
            id="recover-game-id"
            value={gameId}
            onChange={(event) => setGameId(event.target.value)}
            placeholder="ID sprawy"
            autoComplete="off"
            className="min-h-11 w-full rounded-control border border-line bg-elevated px-3 font-mono text-sm text-ink-primary placeholder:text-ink-muted"
          />
          <label htmlFor="recover-secret" className="sr-only">
            Sekret odzyskiwania
          </label>
          <input
            id="recover-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="Sekret odzyskiwania"
            autoComplete="off"
            className="min-h-11 w-full rounded-control border border-line bg-elevated px-3 text-ink-primary placeholder:text-ink-muted"
          />
          {failed && <Notice variant="error">Nie udało się odzyskać dostępu.</Notice>}
          <Button
            type="submit"
            variant="secondary"
            busy={busy}
            disabled={!gameId.trim() || !secret.trim()}
          >
            {busy ? "Odzyskuję…" : "Odzyskaj"}
          </Button>
        </form>
      )}
    </div>
  );
}
