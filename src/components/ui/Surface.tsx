import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Surface — the one sanctioned way to draw a card (spec 19 §5). Route files
// must not compose raw `card ...` class strings after migration.

export type SurfaceVariant = "system" | "soft" | "paper" | "secret" | "formal" | "map";

const VARIANT_CLASSES: Record<SurfaceVariant, string> = {
  system: "rounded-card border border-line bg-card",
  soft: "rounded-tile border border-line bg-card-soft/60",
  paper: "rounded-paper border border-ink/15 bg-paper text-ink shadow-paper texture-paper",
  secret: "rounded-card border border-brass/60 bg-elevated",
  formal: "rounded-card border border-rust/60 bg-surface-formal",
  map: "overflow-hidden rounded-card border border-line bg-elevated p-0",
};

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  /** `map` is edge-to-edge; every other variant pads 16px mobile / 20px desktop. */
  padded?: boolean;
}

export default function Surface({
  variant = "system",
  padded = true,
  className,
  children,
  ...rest
}: SurfaceProps) {
  return (
    <div
      className={cn(
        VARIANT_CLASSES[variant],
        padded && variant !== "map" && "p-4 sm:p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
