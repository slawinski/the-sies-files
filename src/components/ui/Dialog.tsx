"use client";

// Dialog — accessible modal / bottom-sheet (spec 19 §5/§15, audit 18 UX-14).
// Focus trap, Escape-to-close, focus restore to the invoking control, body
// scroll lock. On phones it renders as a bottom sheet; desktop centers it.

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Prevent Escape close for irreversible confirmations when required. */
  disableEscape?: boolean;
  /** Bottom sheet on phone, centered on desktop (default). */
  sheet?: boolean;
}

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  disableEscape = false,
  sheet = true,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
      );

    (focusables()[0] ?? dialog)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (disableEscape) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, disableEscape]);

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-dialog flex justify-center p-0 sm:p-4",
        sheet ? "items-end sm:items-center" : "items-center",
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-md rounded-t-card border border-line bg-elevated shadow-sheet outline-none sm:rounded-card",
          sheet ? "max-h-[85dvh] overflow-y-auto p-4 pb-safe sm:p-5" : "p-5",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="display text-lg leading-tight text-ink-primary">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1.5 text-sm text-ink-secondary">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno"
            className="-mr-1 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-card-soft hover:text-ink-primary"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}
        {footer && (
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
