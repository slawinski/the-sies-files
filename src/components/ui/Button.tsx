"use client";

// Button — the single semantic action control (Visual Design System v2 §12,
// UX Implementation Spec v1 §5/§9). Variants are semantic, not decorative:
// danger is reserved for destructive/recovery actions, formal for game-state
// commits. Never use `danger` because an action "is important".

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "formal" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brass text-ink hover:bg-brass/90 active:bg-brass/80",
  secondary: "border border-brass/40 bg-brass/10 text-brass hover:bg-brass/20",
  quiet: "border border-line bg-card-soft/60 text-ink-secondary hover:border-brass/50 hover:text-ink-primary",
  formal: "bg-rust text-ink hover:bg-rust/90 active:bg-rust/80",
  danger: "bg-danger text-ink hover:bg-danger/90 active:bg-danger/80",
};

/* Minimum interactive target is 44px (audit 18 §9); preferred 48px mobile
   primary; 56px for the single dominant action. */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-11 rounded-control px-3 text-sm",
  md: "min-h-12 rounded-control px-4 text-sm",
  lg: "min-h-14 rounded-control px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Server round-trip in progress — keeps width and label context. */
  busy?: boolean;
  /** Single dominant action spans its container. */
  fullWidth?: boolean;
  /** Leading icon (aria-hidden). */
  icon?: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  busy = false,
  fullWidth = false,
  icon,
  children,
  disabled,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 font-medium transition-colors duration-150",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && "w-full",
        (disabled || busy) && "cursor-not-allowed opacity-50",
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> : icon}
      {children}
    </button>
  );
}
