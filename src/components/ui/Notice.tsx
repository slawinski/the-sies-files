import type { HTMLAttributes } from "react";
import { CircleAlert, CircleCheck, EyeOff, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

// Notice — inline state banner (spec 19 §5). `private` marks shoulder-surfing
// risk; `warning`/`error` are assertive, everything else is polite.

export type NoticeVariant = "info" | "private" | "warning" | "error" | "success";

const VARIANT_CLASSES: Record<NoticeVariant, string> = {
  info: "border-line bg-card-soft/60 text-ink-secondary",
  private: "border-brass/50 bg-brass/10 text-brass",
  warning: "border-brass/50 bg-brass/10 text-brass",
  error: "border-danger/40 bg-danger/10 text-danger",
  success: "border-success/40 bg-success/10 text-success",
};

const ICONS: Record<NoticeVariant, typeof Info> = {
  info: Info,
  private: EyeOff,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CircleCheck,
};

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: NoticeVariant;
  /** aria-live tone: "assertive" only for time-critical state changes. */
  assertive?: boolean;
}

export default function Notice({
  variant = "info",
  assertive = false,
  className,
  children,
  ...rest
}: NoticeProps) {
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === "error" || assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-2.5 rounded-tile border px-4 py-3 text-sm",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
