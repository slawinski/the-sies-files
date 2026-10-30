// GameEndedStage — compact, public end-state summary (screen spec 21 §6).

import Surface from "@/components/ui/Surface";
import Badge from "@/components/ui/Badge";
import { winnerLabel } from "@/lib/presentation/labels";

export default function GameEndedStage({
  winner,
  reason,
}: {
  winner: string;
  reason: string | null;
}) {
  const evil = winner === "EVIL";
  return (
    <Surface variant={evil ? "formal" : "system"} className={!evil ? "border-success/40 bg-success/5" : undefined}>
      <p className="eyebrow">Wynik sprawy</p>
      <h2 className="display mt-2 text-2xl leading-tight text-ink-primary">
        {winnerLabel(winner)}
      </h2>
      {reason && <p className="mt-2 text-sm text-ink-secondary">{reason}</p>}
      <div className="mt-4">
        <Badge variant={evil ? "rust" : "success"}>{evil ? "zło wygrywa" : "dobro wygrywa"}</Badge>
      </div>
    </Surface>
  );
}
