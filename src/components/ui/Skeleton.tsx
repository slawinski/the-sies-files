import { cn } from "@/lib/cn";

// Skeleton loading shapes (audit 18 UX-16). Only for public/non-secret
// structures — never skeletonize anything that would leak secret item counts.

export default function Skeleton({
  variant = "text",
  className,
}: {
  variant?: "text" | "heading" | "tile" | "stat" | "list" | "map";
  className?: string;
}) {
  if (variant === "list") {
    return (
      <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
        <Skeleton variant="tile" className="h-14" />
        <Skeleton variant="tile" className="h-14" />
        <Skeleton variant="tile" className="h-14" />
      </div>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "skeleton block",
        {
          text: "h-4 w-3/4",
          heading: "h-7 w-1/2",
          tile: "w-full",
          stat: "w-full",
          map: "aspect-[4/3] w-full",
        }[variant],
        className,
      )}
    />
  );
}
