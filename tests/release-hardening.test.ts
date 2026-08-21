import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { resetDb, createGameWithPlayers, defaultActionTargets } from "./helpers/db";
import { prisma } from "@/lib/db";
import { generateSetup, commitSetup } from "@/modules/setup/setup.service";
import { startOperational, submitAction, resolveAction, completeOperational } from "@/modules/operational/operational.service";
import { loadStorytellerData } from "@/modules/projections/load";
import { getScenarioDefinition } from "@/modules/scenario/definition";
import { getScriptDefinition } from "@/modules/trouble-brewing/script";

beforeEach(resetDb);

async function runFullOperationalCycle(gameId: string, version: number, playerIds: string[]): Promise<number> {
  let v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
  for (let g = 0; g < 200; g += 1) {
    const st = await loadStorytellerData(gameId);
    const active = (st.operational?.actions ?? []).find(
      (a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER",
    );
    if (!active) break;
    if (active.status === "WAITING_FOR_PLAYER") {
      v = (await submitAction({ gameId, playerId: active.actorPlayerId!, actionId: active.id, commandId: randomUUID(), expectedVersion: v, targetPlayerIds: defaultActionTargets(active.kind, active.actorPlayerId!, playerIds) })).version;
    } else {
      v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
    }
  }
  return (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
}

describe("Milestone 8 — release hardening", () => {
  it("13-player golden path: setup → first Operational → Investigation", async () => {
    const { gameId, version, playerIds } = await createGameWithPlayers(13);
    let v = (await generateSetup({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
    v = (await commitSetup({ gameId, commandId: randomUUID(), expectedVersion: v })).version;

    const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe("ROLE_REVEAL");

    await runFullOperationalCycle(gameId, v, playerIds);
    const after = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(after.status).toBe("ACTIVE");
    expect(after.phase).toBe("INVESTIGATION");
    expect(after.cycleNumber).toBe(1);
  });

  it("scenario content ids are internally consistent", () => {
    const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);
    const clueIds = new Set(def.clues.map((c) => c.id));
    const taskIds = new Set(def.tasks.map((t) => t.id));
    const mapIds = new Set(def.mapVersions.map((m) => m.id));

    expect(mapIds.has(def.initialMapVersionId)).toBe(true);
    for (const qr of def.qrTokens) {
      for (const a of qr.actions) {
        if (a.type === "REVEAL_CLUE") expect(clueIds.has(a.clueId), `qr ${qr.id}`).toBe(true);
        if (a.type === "ISSUE_TASK") expect(taskIds.has(a.taskId), `qr ${qr.id}`).toBe(true);
        if (a.type === "SET_MAP_VERSION") expect(mapIds.has(a.mapVersionId), `qr ${qr.id}`).toBe(true);
      }
    }
    for (const t of def.transitions) {
      for (const a of t.actions) {
        if (a.type === "REVEAL_CLUE") expect(clueIds.has(a.clueId)).toBe(true);
        if (a.type === "SET_MAP_VERSION") expect(mapIds.has(a.mapVersionId)).toBe(true);
      }
    }
    for (const m of def.mapVersions) {
      const ids = m.locations.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length); // unique locations
    }
  });

  it("script/scenario versions are immutable (unknown versions rejected)", () => {
    expect(getScriptDefinition("TROUBLE_BREWING", 1).version).toBe(1);
    expect(() => getScriptDefinition("TROUBLE_BREWING", 2)).toThrow();
    expect(() => getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 2)).toThrow();
  });

  it("PWA manifest is well-formed", () => {
    const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(Array.isArray(manifest.icons) && manifest.icons.length > 0).toBe(true);
    expect(manifest.display).toBe("standalone");
  });
});
