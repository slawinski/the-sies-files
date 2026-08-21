import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CHARACTER_IDS, CHARACTER_DEFINITIONS, characterDisplayName } from "@/modules/trouble-brewing/characters";
import { PRODUCTION_CONTENT_MANIFEST, MAP_ASSET_PATHS } from "@/content/manifest";
import { getScenarioDefinition } from "@/modules/scenario/definition";

describe("R4 — production content gate", () => {
  it("every character has a reviewed Polish display name (not an ID derivation)", () => {
    for (const id of CHARACTER_IDS) {
      const name = CHARACTER_DEFINITIONS[id].displayName.pl;
      expect(name.trim().length).toBeGreaterThan(0);
      // The reviewed name must never be the raw machine ID itself.
      expect(name).not.toBe(id);
    }
    expect(characterDisplayName("BUREAUCRAT")).toBe("Pełnomocnik");
  });

  it("scenario references resolve and content remains clearly non-production", () => {
    const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);
    const clueIds = new Set(def.clues.map((c) => c.id));
    const taskIds = new Set(def.tasks.map((t) => t.id));
    for (const qr of def.qrTokens) {
      for (const a of qr.actions) {
        if (a.type === "REVEAL_CLUE") expect(clueIds.has(a.clueId)).toBe(true);
        if (a.type === "ISSUE_TASK") expect(taskIds.has(a.taskId)).toBe(true);
      }
    }
    // Production gate remains explicitly false until content is approved.
    expect(PRODUCTION_CONTENT_MANIFEST.productionReady).toBe(false);
  });

  it("production-ready gate fails honestly while map assets are absent", () => {
    // The manifest must stay false as long as the production artwork is missing.
    const missing = MAP_ASSET_PATHS.filter(
      (src) => !fs.existsSync(path.join("public", src.replace(/^\//, ""))),
    );
    if (missing.length > 0) {
      expect(PRODUCTION_CONTENT_MANIFEST.productionReady).toBe(false);
    }
  });
});
