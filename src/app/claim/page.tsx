"use client";

// Claim flow (audit 18 §7 / spec 19): the claim link is a security/privacy
// boundary. This screen states explicitly that the device becomes the
// player's private view and what to do when the name is wrong.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiClientError, friendlyMessage } from "@/lib/client-api";
import AppShell, { AppShellContent } from "@/components/ui/AppShell";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import Surface from "@/components/ui/Surface";

type View = "idle" | "submitting" | "error";

export default function ClaimIdentity() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [view, setView] = useState<View>("idle");
  const [error, setError] = useState<string | null>(null);

  const doClaim = useCallback(
    async (rawToken: string) => {
      const trimmed = rawToken.trim();
      if (!trimmed) {
        setError("Wklej swój token odbioru, aby kontynuować.");
        setView("error");
        return;
      }

      setView("submitting");
      setError(null);
      try {
        await api("/api/v1/player-claims/claim", {
          method: "POST",
          body: JSON.stringify({ token: trimmed, commandId: crypto.randomUUID() }),
        });
        router.replace("/player");
      } catch (err) {
        const e = err as ApiClientError;
        if (e.code === "CLAIM_ALREADY_USED" || e.code === "UNAUTHORIZED") {
          setError("Ten link do odbioru został już użyty lub wygasł.");
        } else {
          setError(
            friendlyMessage(e.code ?? "UNKNOWN", "Ten link do odbioru został już użyty lub wygasł."),
          );
        }
        setView("error");
      }
    },
    [router],
  );

  // A claim link arrives as `/claim#<token>` — the token lives in the fragment
  // so it never reaches the server path or access logs (ADR-002).
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (fragment.trim()) {
      setToken(fragment.trim());
      void doClaim(fragment.trim());
    }
  }, [doClaim]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void doClaim(token);
  }

  return (
    <AppShell>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-[11px] uppercase tracking-[0.3em] text-moss">
            The Sieś Files
          </Link>
          <span className="text-meta text-ink-muted">Odbierz tożsamość</span>
        </div>
      </header>

      <AppShellContent>
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <Surface variant="system">
            <p className="eyebrow">Tożsamość</p>
            <h1 className="display mt-2 text-2xl leading-tight text-ink-primary">
              Odbierz swoje miejsce
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
              Otwórz link do odbioru, aby powiązać tę przeglądarkę z twoim miejscem w Wirtualnym
              Kręgu. Po odbiorze to urządzenie staje się twoim prywatnym widokiem sprawy.
            </p>

            {view === "submitting" && (
              <p className="mt-5 text-sm text-ink-secondary">Odbieranie tożsamości…</p>
            )}

            {view !== "submitting" && (
              <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
                <label htmlFor="claim-token" className="sr-only">
                  Token odbioru
                </label>
                <input
                  id="claim-token"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Wklej token odbioru"
                  autoComplete="off"
                  className="min-h-12 w-full rounded-control border border-line bg-card-soft px-3 font-mono text-sm text-ink-primary placeholder:text-ink-muted"
                />
                {error && <Notice variant="error">{error}</Notice>}
                <Button type="submit" fullWidth size="lg">
                  Odbierz tożsamość
                </Button>
              </form>
            )}
          </Surface>

          <Notice variant="private">
            <span className="font-medium">Ten ekran może pokazywać tajne informacje.</span>{" "}
            Sprawdź, czy odbierane imię to na pewno ty. Jeśli imię jest niepoprawne — zamknij ten
            link i poproś prowadzącego o nowy.
          </Notice>
        </div>
      </AppShellContent>
    </AppShell>
  );
}
