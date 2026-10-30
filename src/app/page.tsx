import Link from "next/link";

// Branded entry (audit 18 §7): compact wordmark, one case-file hero, two
// clearly-explained paths. No unexplained "Storyteller" jargon before the
// user has context.

export default function Home() {
  return (
    <main className="texture-shell flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-moss">
          Akta sprawy &middot; wiejskie neo-noir
        </p>
        <h1 className="display mt-3 text-4xl leading-tight text-ink-primary">
          The Sieś Files
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-base leading-relaxed text-ink-secondary">
          Towarzysz gry w dedukcję społeczną — na weekend w terenie, z telefonem w dłoni.
        </p>
      </div>

      <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/storyteller"
          className="flex min-h-14 items-center justify-center rounded-control bg-brass px-6 text-base font-medium text-ink transition-colors hover:bg-brass/90"
        >
          Prowadzę grę
        </Link>
        <Link
          href="/claim"
          className="flex min-h-14 items-center justify-center rounded-control border border-line bg-card-soft/60 px-6 text-base text-ink-secondary transition-colors hover:border-brass/50 hover:text-ink-primary"
        >
          Dołączam jako gracz
        </Link>
      </div>

      <p className="mt-10 max-w-xs text-center text-meta text-ink-muted">
        Prowadzący otwiera sprawę i rozsyła jednorazowe linki do odbioru tożsamości. Gracze grają
        z telefonu — w domu, na podwórku, w terenie.
      </p>
    </main>
  );
}
