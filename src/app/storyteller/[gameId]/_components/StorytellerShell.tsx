"use client";

// StorytellerShell — rail + header strip + view content (audit 18 UX-02).
// Desktop gets the persistent side rail; narrow viewports get a horizontal
// section selector. The lobby header strip carries case identity + readiness.

import type { ReactNode } from "react";
import type { StorytellerGameProjection } from "@/lib/client-api";
import type { StorytellerView } from "@/lib/presentation/types";
import { t } from "@/i18n/t";
import StorytellerRail from "@/components/ui/StorytellerRail";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Pencil } from "lucide-react";

const SECTIONS: Array<{ view: StorytellerView; label: string }> = [
  { view: "control", label: t("stNav.control") },
  { view: "players", label: t("stNav.players") },
  { view: "grimoire", label: t("stNav.grimoire") },
  { view: "scenario", label: t("stNav.scenario") },
  { view: "audit", label: t("stNav.audit") },
  { view: "system", label: t("stNav.system") },
];

export default function StorytellerShell({
  active,
  onNavigate,
  game,
  renaming,
  gameNameDraft,
  onGameNameDraftChange,
  onStartRename,
  onCancelRename,
  onCommitRename,
  renameEnabled,
  busy,
  children,
}: {
  active: StorytellerView;
  onNavigate: (view: StorytellerView) => void;
  game: StorytellerGameProjection;
  renaming: boolean;
  gameNameDraft: string;
  onGameNameDraftChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  renameEnabled: boolean;
  busy: boolean;
  children: ReactNode;
}) {
  const ready = game.isReady;
  const need = Math.max(0, 13 - game.participantCount);

  return (
    <div className="flex gap-4">
      <StorytellerRail active={active} onNavigate={onNavigate} />

      <div className="min-w-0 flex-1">
        {/* Narrow-viewport section selector (rail is lg-only). */}
        <nav
          aria-label={t("stNav.aria")}
          className="mb-4 flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
        >
          {SECTIONS.map((section) => {
            const isActive = section.view === active;
            return (
              <button
                key={section.view}
                type="button"
                onClick={() => onNavigate(section.view)}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "min-h-11 shrink-0 rounded-chip border border-brass/60 bg-brass/10 px-3.5 text-sm text-brass"
                    : "min-h-11 shrink-0 rounded-chip border border-line bg-card-soft/60 px-3.5 text-sm text-ink-secondary hover:text-ink-primary"
                }
              >
                {section.label}
              </button>
            );
          })}
        </nav>

        {/* Lobby identity strip — case name + readiness gate. */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {renaming ? (
              <div className="flex max-w-md flex-wrap items-center gap-2">
                <label htmlFor="game-name-input" className="sr-only">
                  Nowa nazwa sprawy
                </label>
                <input
                  id="game-name-input"
                  value={gameNameDraft}
                  onChange={(event) => onGameNameDraftChange(event.target.value)}
                  autoFocus
                  autoComplete="off"
                  className="min-h-11 w-full min-w-52 flex-1 rounded-control border border-line bg-elevated px-3 text-base text-ink-primary"
                />
                <Button variant="secondary" onClick={onCommitRename} busy={busy} disabled={!gameNameDraft.trim()}>
                  Zapisz
                </Button>
                <Button variant="quiet" onClick={onCancelRename}>
                  Anuluj
                </Button>
              </div>
            ) : (
              <>
                <h1 className="display break-words text-2xl leading-tight text-ink-primary">
                  {game.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-meta text-ink-muted">
                    {game.participantCount} {game.participantCount === 1 ? "uczestnik" : "uczestników"}
                  </span>
                  {renameEnabled && (
                    <button
                      type="button"
                      onClick={onStartRename}
                      disabled={busy}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-meta text-ink-muted hover:text-ink-primary"
                    >
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                      Zmień nazwę
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <Badge variant={ready ? "success" : "brass"}>
            {ready
              ? "Gotowe do konfiguracji"
              : `Dodaj jeszcze ${need} ${need === 1 ? "uczestnika" : "uczestników"}`}
          </Badge>
        </div>

        {children}
      </div>
    </div>
  );
}
