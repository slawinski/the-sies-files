"use client";

// AuditView — dense, utility-first event log (spec: "a tool, not a bento mood
// screen"). Table-style rows on desktop, stacked soft cards on phones. The
// page controller owns all data and callbacks; this component is purely
// presentational.

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, CircleCheck, Copy } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import Skeleton from "@/components/ui/Skeleton";
import Surface from "@/components/ui/Surface";
import { cn } from "@/lib/cn";
import {
  AUDIT_CATEGORIES,
  type AuditCategoryDto,
  type StorytellerAuditDto,
} from "@/lib/client-api";

/** Polish labels — enum ids never surface as primary copy. */
const CATEGORY_LABELS: Record<AuditCategoryDto, string> = {
  GAME_ENGINE: "Silnik gry",
  OPERATIONAL: "Operacyjne",
  INVESTIGATION_VOTING: "Śledztwo i głosowania",
  SCENARIO: "Scenariusz",
  ACCESS_SESSION: "Dostęp i sesje",
  RECOVERY: "Odzyskiwanie",
};

export interface AuditViewProps {
  audit: StorytellerAuditDto | null; // null while loading
  auditError: boolean; // load failed
  auditLoadingMore: boolean;
  selectedCategories: AuditCategoryDto[]; // [] = all
  onToggleCategory: (id: AuditCategoryDto) => void;
  onClearCategories: () => void;
  onLoadMore: () => void;
  formatTime: (iso: string) => string;
}

export default function AuditView({
  audit,
  auditError,
  auditLoadingMore,
  selectedCategories,
  onToggleCategory,
  onClearCategories,
  onLoadMore,
  formatTime,
}: AuditViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  function toggleExpanded(sequence: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sequence)) next.delete(sequence);
      else next.add(sequence);
      return next;
    });
  }

  async function handleCopy() {
    if (!audit || audit.events.length === 0) return;
    const summary = audit.events.map((event) => ({
      sequence: event.sequence,
      eventType: event.eventType,
      category: event.category,
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
    } catch {
      return; // clipboard unavailable — stay quiet, keep the button honest
    }
    setCopied(true);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }

  const events = audit?.events ?? [];

  return (
    <Surface variant="system">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">AUDYT</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-meta tabular-nums text-ink-muted">
            {events.length} zdarzeń
          </span>
          <Button
            variant="quiet"
            size="sm"
            onClick={handleCopy}
            disabled={events.length === 0}
            icon={
              copied ? (
                <CircleCheck aria-hidden="true" className="h-4 w-4 text-success" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )
            }
          >
            {copied ? "Skopiowano" : "Kopiuj zdarzenia"}
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Filtruj kategorie audytu"
        className="mt-4 flex flex-wrap gap-1.5"
      >
        <button
          type="button"
          onClick={onClearCategories}
          aria-pressed={selectedCategories.length === 0}
          className={cn(
            "min-h-11 rounded-chip border px-3.5 text-sm transition-colors",
            selectedCategories.length === 0
              ? "border-moss/60 bg-moss/15 text-moss"
              : "border-line text-ink-secondary hover:border-moss/40 hover:text-ink-primary",
          )}
        >
          Wszystkie
        </button>
        {AUDIT_CATEGORIES.map((id) => {
          const active = selectedCategories.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onToggleCategory(id)}
              aria-pressed={active}
              className={cn(
                "min-h-11 rounded-chip border px-3.5 text-sm transition-colors",
                active
                  ? "border-moss/60 bg-moss/15 text-moss"
                  : "border-line text-ink-secondary hover:border-moss/40 hover:text-ink-primary",
              )}
            >
              {CATEGORY_LABELS[id]}
            </button>
          );
        })}
      </div>

      {!audit && !auditError && <Skeleton variant="list" className="mt-4" />}

      {!audit && auditError && (
        <Notice variant="error" className="mt-4">
          Nie udało się wczytać dziennika zdarzeń.
        </Notice>
      )}

      {audit && events.length === 0 && (
        <p className="mt-4 text-sm text-ink-muted">Brak zdarzeń.</p>
      )}

      {audit && events.length > 0 && (
        <>
          {/* Desktop: dense table with sticky header. */}
          <div className="mt-4 hidden overflow-auto rounded-tile border border-line sm:block">
            <table className="w-full table-fixed">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 w-20 border-b border-line bg-card px-3 py-2 text-left text-meta font-medium text-ink-muted">
                    #
                  </th>
                  <th className="sticky top-0 z-10 w-32 border-b border-line bg-card px-3 py-2 text-left text-meta font-medium text-ink-muted">
                    czas
                  </th>
                  <th className="sticky top-0 z-10 w-44 border-b border-line bg-card px-3 py-2 text-left text-meta font-medium text-ink-muted">
                    kategoria
                  </th>
                  <th className="sticky top-0 z-10 border-b border-line bg-card px-3 py-2 text-left text-meta font-medium text-ink-muted">
                    zdarzenie
                  </th>
                  <th className="sticky top-0 z-10 w-32 border-b border-line bg-card px-3 py-2 text-left text-meta font-medium text-ink-muted">
                    aktor
                  </th>
                  <th className="sticky top-0 z-10 w-20 border-b border-line bg-card px-3 py-2 text-left text-meta font-medium text-ink-muted">
                    wersja
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const expanded = expandedIds.has(event.sequence);
                  return (
                    <Fragment key={event.sequence}>
                      <tr className="border-t border-line first:border-t-0">
                        <td className="w-20 px-3 py-1">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(event.sequence)}
                            aria-expanded={expanded}
                            aria-label={`${
                              expanded ? "Zwiń" : "Pokaż"
                            } szczegóły zdarzenia #${event.sequence}`}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 font-mono text-meta tabular-nums text-ink-secondary hover:text-ink-primary"
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                                expanded && "rotate-180",
                              )}
                            />
                            #{event.sequence}
                          </button>
                        </td>
                        <td className="w-32 px-3 py-2 text-meta tabular-nums text-ink-muted">
                          {formatTime(event.createdAt)}
                        </td>
                        <td className="w-44 px-3 py-2">
                          <Badge variant="neutral">{CATEGORY_LABELS[event.category]}</Badge>
                        </td>
                        <td className="break-words px-3 py-2 text-sm text-ink-primary">
                          {event.eventType}
                        </td>
                        <td className="w-32 px-3 py-2">
                          <p className="truncate text-sm text-ink-secondary">
                            {event.actor ?? "—"}
                          </p>
                        </td>
                        <td className="w-20 px-3 py-2 text-meta tabular-nums text-ink-muted">
                          {event.gameVersion}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-line bg-card-soft/30">
                          <td colSpan={6} className="px-3 py-2">
                            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-meta text-ink-muted">
                              {JSON.stringify(event.payload ?? null, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked soft cards. */}
          <ul className="mt-4 flex flex-col gap-2 sm:hidden">
            {events.map((event) => {
              const expanded = expandedIds.has(event.sequence);
              return (
                <li
                  key={event.sequence}
                  className="rounded-tile border border-line bg-card-soft/60 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(event.sequence)}
                      aria-expanded={expanded}
                      aria-label={`${
                        expanded ? "Zwiń" : "Pokaż"
                      } szczegóły zdarzenia #${event.sequence}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 font-mono text-meta tabular-nums text-ink-secondary hover:text-ink-primary"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                          expanded && "rotate-180",
                        )}
                      />
                      #{event.sequence}
                    </button>
                    <Badge variant="neutral">{CATEGORY_LABELS[event.category]}</Badge>
                    <span className="ml-auto text-meta tabular-nums text-ink-muted">
                      {formatTime(event.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm text-ink-primary">
                    {event.eventType}
                  </p>
                  <p className="mt-0.5 truncate text-meta text-ink-muted">
                    {event.actor ?? "—"} · wersja {event.gameVersion}
                  </p>
                  {expanded && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-tile border border-line bg-card-soft/40 p-2 font-mono text-meta text-ink-muted">
                      {JSON.stringify(event.payload ?? null, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>

          {audit.nextCursor !== null && (
            <div className="mt-4 flex justify-center">
              <Button variant="quiet" onClick={onLoadMore} busy={auditLoadingMore}>
                {auditLoadingMore ? "Wczytuję…" : "Więcej"}
              </Button>
            </div>
          )}
        </>
      )}
    </Surface>
  );
}
