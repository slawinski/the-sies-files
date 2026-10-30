import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Badge — compact status chip. Never relies on color alone: every state
// carries its label text (audit 18 §9).

export type BadgeVariant = "neutral" | "moss" | "brass" | "rust" | "success" | "danger";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "border-line text-ink-secondary",
  moss: "border-moss/40 bg-moss/10 text-moss",
  brass: "border-brass/40 bg-brass/10 text-brass",
  rust: "border-rust/40 bg-rust/10 text-rust",
  success: "border-success/40 bg-success/10 text-success",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export default function Badge({ variant = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-0.5 text-meta font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
