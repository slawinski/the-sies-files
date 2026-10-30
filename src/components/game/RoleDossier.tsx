// RoleDossier — the confidential role document shared by the full-screen
// PrivateReveal and the intentional re-reveal dialog. Parchment, ink, no
// decoration that leaks alignment.

import type { RoleRevealDto } from "@/lib/client-api";
import { characterDisplayName, type CharacterId } from "@/modules/trouble-brewing/characters";
import { alignmentLabel } from "@/lib/presentation/labels";
import DossierDocument from "@/components/ui/DossierDocument";

export default function RoleDossier({
  role,
  nameById,
}: {
  role: RoleRevealDto;
  nameById: Map<string, string>;
}) {
  return (
    <DossierDocument
      tone="secret"
      eyebrow="informacja prywatna · nie pokazuj nikomu"
      title={characterDisplayName(role.characterId)}
      stamp="tajne"
      metadata={[
        { label: "Stronnictwo", value: alignmentLabel(role.alignment) },
        ...(role.publicCharacter ? [{ label: "Rola", value: "publiczna" }] : []),
      ]}
    >
      {role.teamKnowledge && (
        <div className="rounded-tile border border-danger/30 bg-danger/5 p-3">
          <p className="eyebrow mb-1.5 text-danger">Drużyna Zła</p>
          <p className="text-sm leading-relaxed text-ink/85">
            Demon:{" "}
            <span className="font-medium">
              {nameById.get(role.teamKnowledge.demonId) ?? role.teamKnowledge.demonId}
            </span>
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink/85">
            Sługusy:{" "}
            {role.teamKnowledge.minionIds.length > 0
              ? role.teamKnowledge.minionIds.map((id) => nameById.get(id) ?? id).join(", ")
              : "—"}
          </p>
        </div>
      )}

      {role.bluffs && role.bluffs.length > 0 && (
        <div className="rounded-tile border border-ink/20 bg-ink/5 p-3">
          <p className="eyebrow mb-1.5 text-ink/75">Bluffy Demona</p>
          <p className="text-sm leading-relaxed text-ink/85">
            {role.bluffs.map((id) => characterDisplayName(id as CharacterId)).join(", ")}
          </p>
        </div>
      )}
    </DossierDocument>
  );
}
