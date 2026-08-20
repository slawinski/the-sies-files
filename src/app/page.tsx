import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
      <div className="text-center">
        <p className="display mb-3 text-sm tracking-[0.3em] text-moss">
          Akta sprawy &middot; Sieśki
        </p>
        <h1 className="display text-4xl leading-tight text-ink-primary">
          The Sieś Files
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-ink-muted">
          Towarzysz gry w dedukcję społeczną w klimacie wiejskiego neo-noir — na weekend w terenie.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/storyteller"
          className="flex min-h-12 items-center justify-center rounded-xl border border-brass/60 bg-brass/10 px-5 text-ink-primary transition-colors hover:bg-brass/20"
        >
          Prowadzący
        </Link>
        <Link
          href="/claim"
          className="flex min-h-12 items-center justify-center rounded-xl border border-line px-5 text-ink-secondary transition-colors hover:border-brass/50 hover:text-ink-primary"
        >
          Mam link do odbioru
        </Link>
      </div>
    </main>
  );
}
