"use client";

// Storyteller side rail (audit 18 UX-02 / v2 §14): six persistent sections,
// System visually separated. Active item gets a soft fill + left indicator.

import {
  BookOpen,
  Gauge,
  Route,
  ScrollText,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { StorytellerView } from "@/lib/presentation/types";
import { t } from "@/i18n/t";

const PRIMARY: Array<{ view: StorytellerView; label: string; icon: LucideIcon }> = [
  { view: "control", label: t("stNav.control"), icon: Gauge },
  { view: "players", label: t("stNav.players"), icon: Users },
  { view: "grimoire", label: t("stNav.grimoire"), icon: BookOpen },
  { view: "scenario", label: t("stNav.scenario"), icon: Route },
  { view: "audit", label: t("stNav.audit"), icon: ScrollText },
];

const SYSTEM: Array<{ view: StorytellerView; label: string; icon: LucideIcon }> = [
  { view: "system", label: t("stNav.system"), icon: Wrench },
];

function RailItem({
  view,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  view: StorytellerView;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onNavigate: (view: StorytellerView) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(view)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm transition-colors duration-150",
        active
          ? "bg-card-soft text-ink-primary"
          : "text-ink-muted hover:bg-card-soft/60 hover:text-ink-secondary",
      )}
    >
      {active && (
        <span aria-hidden="true" className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-brass" />
      )}
      <Icon aria-hidden="true" className={cn("h-5 w-5", active && "text-brass")} strokeWidth={1.75} />
      {label}
    </button>
  );
}

export default function StorytellerRail({
  active,
  onNavigate,
}: {
  active: StorytellerView;
  onNavigate: (view: StorytellerView) => void;
}) {
  return (
    <nav
      aria-label={t("stNav.aria")}
      className="sticky top-0 hidden h-dvh w-48 shrink-0 flex-col gap-1 border-r border-line bg-elevated/60 p-3 lg:flex"
    >
      <div className="flex flex-col gap-1">
        {PRIMARY.map((item) => (
          <RailItem
            key={item.view}
            {...item}
            active={item.view === active}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-1 border-t border-line pt-4">
        {SYSTEM.map((item) => (
          <RailItem
            key={item.view}
            {...item}
            active={item.view === active}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
}
