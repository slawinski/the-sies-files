import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6">
      <div className="text-center">
        <p className="display mb-3 text-sm tracking-[0.3em] text-moss">
          Case file &middot; Sieśki
        </p>
        <h1 className="display text-4xl leading-tight text-ink-primary">
          The Sieś Files
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-ink-muted">
          A rural neo-noir social-deduction companion for a weekend in the field.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/storyteller"
          className="flex min-h-12 items-center justify-center rounded-xl border border-brass/60 bg-brass/10 px-5 text-ink-primary transition-colors hover:bg-brass/20"
        >
          Storyteller
        </Link>
        <Link
          href="/claim"
          className="flex min-h-12 items-center justify-center rounded-xl border border-line px-5 text-ink-secondary transition-colors hover:border-brass/50 hover:text-ink-primary"
        >
          I have a claim link
        </Link>
      </div>
    </main>
  );
}
