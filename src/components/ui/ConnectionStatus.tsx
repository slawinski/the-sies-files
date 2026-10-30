import { cn } from "@/lib/cn";
import type { RealtimeHealth } from "@/components/useGameEventStream";

// Compact persistent connection indicator (spec 19 §11). Always carries text —
// never color alone. The dot may pulse only while reconnecting (v2 §20).

export default function ConnectionStatus({
  health,
  className,
  prominent = false,
}: {
  health: RealtimeHealth;
  className?: string;
  /** Larger pill style for the Storyteller header. */
  prominent?: boolean;
}) {
  const config = {
    LIVE: { label: "LIVE", tone: "text-moss", dot: "bg-moss", pulse: false },
    RECONNECTING: { label: "ŁĄCZENIE…", tone: "text-brass", dot: "bg-brass", pulse: true },
    OFFLINE: { label: "OFFLINE", tone: "text-danger", dot: "bg-danger", pulse: false },
  }[health];

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-meta font-medium",
        config.tone,
        prominent && "min-h-11 rounded-chip border border-line bg-card-soft/60 px-3",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full", config.dot, config.pulse && "animate-pulse")}
      />
      {config.label}
    </span>
  );
}
