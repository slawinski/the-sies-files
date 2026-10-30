"use client";

// Timeline (v2 §11 / spec 19 §6.6): semantic dot/icon, event label, secondary
// time, optional detail disclosure. Time is always secondary to the label.

import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TimelineEvent {
  id: string;
  icon?: LucideIcon;
  /** Dot tone — kept quiet so the event label stays primary. */
  tone?: "neutral" | "moss" | "brass" | "rust";
  label: ReactNode;
  time?: string;
  detail?: ReactNode;
}

const DOT_TONES: Record<NonNullable<TimelineEvent["tone"]>, string> = {
  neutral: "bg-ink-muted",
  moss: "bg-moss",
  brass: "bg-brass",
  rust: "bg-rust",
};

export default function Timeline({
  events,
  emptyLabel = "Brak zdarzeń.",
}: {
  events: TimelineEvent[];
  emptyLabel?: string;
}) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{emptyLabel}</p>;
  }

  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const tone = event.tone ?? "neutral";
        return (
          <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            {index < events.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[9px] top-6 h-[calc(100%-1rem)] w-px bg-line"
              />
            )}
            <span
              aria-hidden="true"
              className={cn("relative mt-1 h-5 w-5 shrink-0", event.icon && "flex items-center justify-center")}
            >
              {event.icon ? (
                <event.icon className="h-5 w-5 text-ink-muted" strokeWidth={1.75} />
              ) : (
                <span className={cn("absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full", DOT_TONES[tone])} />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-ink-primary">{event.label}</p>
              {event.time && <p className="mt-0.5 text-meta tabular-nums text-ink-muted">{event.time}</p>}
              {event.detail && <TimelineDetail detail={event.detail} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TimelineDetail({ detail }: { detail: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-meta text-ink-secondary hover:text-ink-primary"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")}
        />
        {open ? "zwiń" : "szczegóły"}
      </button>
      {open && <div className="mt-1 rounded-tile border border-line bg-card-soft/60 p-3">{detail}</div>}
    </div>
  );
}
