// DeliveredInfo — renders operational info results in plain Polish
// (shared by the case summary and the journal timeline).

import type { DeliveredInfoDto, InfoResultDto } from "@/lib/client-api";
import { characterDisplayName } from "@/modules/trouble-brewing/characters";

function isInfoResult(result: unknown): result is InfoResultDto {
  if (typeof result !== "object" || result === null) return false;
  return "kind" in result && typeof (result as { kind?: unknown }).kind === "string";
}

export function DeliveredInfoText({
  item,
  nameById,
}: {
  item: DeliveredInfoDto;
  nameById: Map<string, string>;
}) {
  const result = item.result;
  if (isInfoResult(result)) {
    switch (result.kind) {
      case "CHARACTER_CANDIDATES":
        return (
          <>
            {characterDisplayName(result.characterId)} —{" "}
            {result.candidatePlayerIds.map((id) => nameById.get(id) ?? id).join(", ")}
          </>
        );
      case "CHARACTER":
        return (
          <>
            {characterDisplayName(result.characterId)} —{" "}
            {nameById.get(result.playerId) ?? result.playerId}
          </>
        );
      case "NUMBER":
        return <>Liczba: {result.value}</>;
      case "NO_OUTSIDERS":
        return <>brak outsiderów</>;
      case "DEMON_YES_NO":
        return <>{result.value ? "Tak" : "Nie"}</>;
      case "GRIMOIRE":
        return <>Pełna lista ról ({result.assignments.length})</>;
    }
  }
  if (result && typeof result === "object" && "targetPlayerIds" in result) {
    const ids = (result as { targetPlayerIds?: string[] }).targetPlayerIds ?? [];
    return <>Wybrani: {ids.map((id) => nameById.get(id) ?? id).join(", ")}</>;
  }
  return <span className="text-ink-muted">—</span>;
}
