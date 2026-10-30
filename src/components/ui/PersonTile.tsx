"use client";

// PersonTile (v2 §11): people are the core entities of the game. Initials or
// authored portraits only — never decorative fingerprints. States: default,
// selected, disabled, dead, nominee.

import { cn } from "@/lib/cn";
import type { BadgeVariant } from "./Badge";
import Badge from "./Badge";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}

export interface PersonTileProps {
  seat: number;
  name: string;
  statusLabel?: string;
  statusTone?: BadgeVariant;
  selected?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  imageUrl?: string;
  isSelf?: boolean;
  nominee?: boolean;
  onClick?: () => void;
  /** Trailing controls (overflow menu etc.) — only for non-interactive rows. */
  trailing?: React.ReactNode;
}

export default function PersonTile({
  seat,
  name,
  statusLabel,
  statusTone = "neutral",
  selected = false,
  disabled = false,
  disabledReason,
  imageUrl,
  isSelf = false,
  nominee = false,
  onClick,
  trailing,
}: PersonTileProps) {
  const interactive = onClick !== undefined;
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-elevated text-sm font-medium uppercase text-ink-secondary",
          imageUrl && "border-transparent",
        )}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base text-ink-primary">{name}</span>
          <span className="shrink-0 text-meta tabular-nums text-ink-muted">
            {String(seat + 1).padStart(2, "0")}
          </span>
        </span>
        {(statusLabel || isSelf) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {statusLabel && <Badge variant={statusTone}>{statusLabel}</Badge>}
            {isSelf && <Badge variant="moss">ty</Badge>}
          </span>
        )}
        {disabled && disabledReason && (
          <span className="mt-0.5 block text-meta text-ink-muted">{disabledReason}</span>
        )}
      </span>

      {selected && <Badge variant="brass">wybrano</Badge>}
      {trailing}
    </>
  );

  const className = cn(
    "flex w-full items-center gap-3 rounded-tile border px-3 py-2.5 text-left transition-colors duration-150",
    selected && "border-brass bg-brass/10",
    !selected && !nominee && "border-line bg-card-soft/60",
    nominee && !selected && "border-rust/60 bg-rust/5",
    !disabled && interactive && "hover:border-brass/40",
    disabled && "cursor-not-allowed opacity-50",
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected || undefined}
        className={className}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
