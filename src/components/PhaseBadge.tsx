"use client";

import { useEffect, useRef, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  LOBBY: "Poczekalnia",
  SETUP: "Konfiguracja",
  ROLE_REVEAL: "Odbiór ról",
  ACTIVE: "W toku",
  ENDED: "Sprawa zakończona",
};

function badgeLabel(phase: string | null, status: string): string {
  if (phase === "OPERATIONAL") return "Faza operacyjna";
  if (phase === "INVESTIGATION") return "Śledztwo";
  return STATUS_LABELS[status] ?? status;
}

/**
 * Phase/status badge with a one-time soft outline pulse whenever the game
 * phase changes (docs/11 §13). Informational only — no state is conveyed by
 * color alone, and the pulse is neutralized under prefers-reduced-motion.
 */
export default function PhaseBadge({
  phase,
  status,
  className = "",
}: {
  phase: string | null;
  status: string;
  className?: string;
}) {
  const [pulsing, setPulsing] = useState(false);
  const prevPhaseRef = useRef(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === phase || prev === null) return;
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), 1000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <span
      className={`inline-flex items-center rounded-full border border-line bg-card-soft/60 px-3 py-1 text-meta text-ink-secondary ${
        pulsing ? "phase-pulse" : ""
      } ${className}`}
    >
      {badgeLabel(phase, status)}
    </span>
  );
}
