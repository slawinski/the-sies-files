import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import Surface from "./Surface";

// DossierDocument (spec 19 §8 / v2 §11): the canonical "received case material"
// surface — evidence, clues, role documents. Paper is for authored/received
// material only; never for settings or generic forms. Texture is a subtle
// pseudo-element layer; content always sits above it.

export interface DossierDocumentProps {
  eyebrow?: string;
  title: string;
  body?: ReactNode;
  metadata?: Array<{ label: string; value: string }>;
  stamp?: string;
  illustration?: ReactNode;
  tone?: "neutral" | "secret" | "formal";
  children?: ReactNode;
}

export default function DossierDocument({
  eyebrow,
  title,
  body,
  metadata,
  stamp,
  illustration,
  tone = "neutral",
  children,
}: DossierDocumentProps) {
  return (
    <Surface variant="paper" className="relative">
      {tone === "secret" && (
        <p className="eyebrow mb-2 flex items-center gap-1.5 text-brass">
          informacja prywatna
        </p>
      )}
      {eyebrow && <p className="eyebrow mb-1 text-ink/75">{eyebrow}</p>}
      <h2 className="display text-lg leading-snug text-ink">{title}</h2>

      {illustration && <div className="mt-3 overflow-hidden rounded-tile border border-ink/15">{illustration}</div>}

      {body && <div className="mt-3 text-base leading-relaxed text-ink/85">{body}</div>}

      {metadata && metadata.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-ink/15 pt-3">
          {metadata.map((item) => (
            <div key={item.label}>
              <dt className="text-meta uppercase tracking-[0.15em] text-ink/75">{item.label}</dt>
              <dd className="text-sm tabular-nums text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {children && <div className="mt-4">{children}</div>}

      {stamp && (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute right-4 top-4 rotate-2 rounded-sm border-2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.15em]",
              tone === "formal" ? "border-rust/70 text-rust" : "border-ink/30 text-ink/50",
            )}
          >
            {stamp}
          </span>
          <span className="sr-only">{stamp}</span>
        </>
      )}
    </Surface>
  );
}
