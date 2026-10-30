import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import Surface from "./Surface";
import type { BadgeVariant } from "./Badge";

const TONE_TEXT: Record<BadgeVariant, string> = {
  neutral: "text-ink-primary",
  moss: "text-moss",
  brass: "text-brass",
  rust: "text-rust",
  success: "text-success",
  danger: "text-danger",
};

// StatTile (v2 §11): exactly one compact metric — label, value, optional icon.
// Do not create a tile for every datum.

export default function StatTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: BadgeVariant;
  hint?: string;
}) {
  return (
    <Surface variant="soft" className="min-h-20">
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />}
      </div>
      <p className={cn("mt-1.5 text-lg font-semibold leading-tight", TONE_TEXT[tone])}>{value}</p>
      {hint && <p className="mt-1 text-meta text-ink-muted">{hint}</p>}
    </Surface>
  );
}
