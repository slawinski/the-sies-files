"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiClientError, friendlyMessage } from "@/lib/client-api";

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
        setError("Paste your claim token to continue.");
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
          setError("This claim link has already been used or has expired.");
        } else {
          setError(friendlyMessage(e.code ?? "UNKNOWN", "This claim link has already been used or has expired."));
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
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="display text-sm tracking-[0.3em] text-moss">
            The Sieś Files
          </Link>
          <span className="text-xs text-ink-muted">Claim identity</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="card">
          <p className="display text-xs tracking-[0.25em] text-moss">Identity</p>
          <h1 className="display mt-2 text-2xl leading-tight text-ink-primary">
            Claim your seat
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Open your claim link to bind this browser to your place in the Virtual Circle.
          </p>

          {view === "submitting" && (
            <p className="mt-5 text-sm text-ink-secondary">Claiming your identity…</p>
          )}

          {view !== "submitting" && (
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
              <label htmlFor="claim-token" className="sr-only">
                Claim token
              </label>
              <input
                id="claim-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your claim token"
                autoComplete="off"
                className="min-h-11 w-full rounded-xl border border-line bg-card-soft px-3 font-mono text-sm text-ink-primary placeholder:text-ink-muted"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              <button
                type="submit"
                className="min-h-12 rounded-xl border border-brass/60 bg-brass/10 px-5 text-ink-primary transition-colors hover:bg-brass/20"
              >
                Claim identity
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
