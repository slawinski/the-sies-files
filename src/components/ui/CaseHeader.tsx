import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { RealtimeHealth } from "@/components/useGameEventStream";
import ConnectionStatus from "./ConnectionStatus";

// CaseHeader (spec 19 §4 / v2 §11): compact wordmark, prominent phase label,
// connection state, restrained formal/critical mode. Never a giant hero title.

export interface CaseHeaderProps {
  phaseLabel: string;
  cycleLabel?: string;
  caseName?: string;
  mode?: "quiet" | "formal" | "critical";
  connection?: RealtimeHealth;
  privacy?: "public" | "private";
  /** Extra controls (e.g. Storyteller privacy cover). */
  right?: ReactNode;
}

export default function CaseHeader({
  phaseLabel,
  cycleLabel,
  caseName,
  mode = "quiet",
  connection,
  privacy = "public",
  right,
}: CaseHeaderProps) {
  return (
    <header
      className={cn(
        "border-b border-line bg-canvas/95 backdrop-blur",
        mode === "formal" && "formal-line",
        mode === "critical" && "border-b-danger/50",
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-[0.3em] text-moss">
            The Sieś Files
          </p>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
            <h1
              aria-live="polite"
              className="display truncate text-base leading-tight text-ink-primary sm:text-lg"
            >
              {phaseLabel}
            </h1>
            {cycleLabel && (
              <span className="shrink-0 text-meta tabular-nums text-ink-muted">{cycleLabel}</span>
            )}
            {caseName && (
              <span className="hidden truncate text-meta text-ink-muted sm:inline">
                · {caseName}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {connection && <ConnectionStatus health={connection} />}
          {privacy === "private" && (
            <span className="text-meta uppercase tracking-[0.2em] text-brass">prywatne</span>
          )}
          {right}
        </div>
      </div>
    </header>
  );
}
