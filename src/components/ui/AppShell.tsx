import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// AppShell (spec 19 §4): canvas background, optional grain, page max width.
// No game-domain logic lives here. Player content stays phone-like on wide
// screens (audit 18 §10); Storyteller gets a wider operational canvas.

export default function AppShell({
  children,
  texture = false,
  className,
}: {
  children: ReactNode;
  texture?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-dvh flex-col", texture && "texture-shell", className)}>
      {children}
    </div>
  );
}

export function AppShellContent({
  children,
  variant = "player",
  className,
}: {
  children: ReactNode;
  variant?: "player" | "storyteller" | "bare";
  className?: string;
}) {
  return (
    <main
      className={cn(
        "w-full flex-1 px-4 py-5",
        variant === "player" && "mx-auto max-w-md",
        variant === "storyteller" && "mx-auto max-w-[1400px] px-5 py-6 sm:px-6",
        className,
      )}
    >
      {children}
    </main>
  );
}
