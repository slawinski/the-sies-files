"use client";

// Player bottom navigation (audit 18 UX-09 / v2 §14): four stable destinations,
// safe-area aware, 24px icons + labels, current state encoded with text AND
// shape/color. Hidden only on private reveal overlays / camera full-screen.

import { FolderOpen, Map, NotebookPen, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PlayerView } from "@/lib/presentation/types";
import { t } from "@/i18n/t";

const ITEMS: Array<{ view: PlayerView; label: string; icon: LucideIcon }> = [
  { view: "case", label: t("nav.case"), icon: FolderOpen },
  { view: "people", label: t("nav.people"), icon: Users },
  { view: "journal", label: t("nav.journal"), icon: NotebookPen },
  { view: "map", label: t("nav.map"), icon: Map },
];

export default function BottomNav({
  active,
  onNavigate,
  hidden = false,
}: {
  active: PlayerView;
  onNavigate: (view: PlayerView) => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <nav
      aria-label={t("nav.aria")}
      className="fixed inset-x-0 bottom-0 z-nav border-t border-line bg-elevated/95 pb-safe backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-md">
        {ITEMS.map(({ view, label, icon: Icon }) => {
          const isActive = view === active;
          return (
            <button
              key={view}
              type="button"
              onClick={() => onNavigate(view)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 pt-1.5 text-meta transition-colors duration-150",
                isActive ? "text-ink-primary" : "text-ink-muted hover:text-ink-secondary",
              )}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-brass"
                />
              )}
              <Icon
                aria-hidden="true"
                className={cn("h-6 w-6", isActive && "text-brass")}
                strokeWidth={1.75}
              />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
