import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { resetDb, createGameWithPlayers, defaultActionTargets } from "./helpers/db";
import { prisma } from "@/lib/db";
import { scanQr } from "@/modules/scenario/scenario.service";
import { startOperational, submitAction, resolveAction, completeOperational } from "@/modules/operational/operational.service";
import { loadStorytellerData } from "@/modules/projections/load";
import { buildStorytellerProjection } from "@/modules/projections/projections";
import { alignmentOf, type CharacterId } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";
import {
  MAP_LAYERS,
  layersUnlockedByMapVersion,
  type MapLayerId,
} from "@/modules/map/layers";
import {
  buildMapStateDto,
  getMapRevision,
  nextMapRevision,
} from "@/modules/map/state";
import { readProtectedLayerAsset, MAP_BASE_PUBLIC_URL } from "@/modules/map/assets";
import { getScenarioDefinition } from "@/modules/scenario/definition";
import {
  FULL_VIEW,
  INITIAL_VIEW,
  PRE_WORLD,
  POST_WORLD,
  PRE_MIN_SCALE,
  PRE_MAX_SCALE,
  clampRect,
  panRect,
  rectToCss,
  tweenRect,
  zoomRectAbout,
  rectScale,
  type Rect,
} from "@/components/map-camera";

beforeEach(resetDb);

const ROLES13: CharacterId[] = [
  "MONK", "SOLDIER", "EMPATH", "CHEF", "FORTUNE_TELLER", "WASHERWOMAN",
  "INVESTIGATOR", "MAYOR", "RAVENKEEPER", "POISONER", "BARON", "SPY", "IMP",
];

async function commitCustomSetup() {
  const { gameId, playerIds } = await createGameWithPlayers(13);
  const assignments = playerIds.map((playerId, i) => ({
    playerId, virtualSeat: i, participantKind: "NORMAL" as const,
    trueCharacterId: ROLES13[i], perceivedCharacterId: ROLES13[i], trueAlignment: alignmentOf(ROLES13[i]),
  }));
  const candidate: SetupCandidate = {
    generatorVersion: 1, participantCount: 13, normalCount: 13,
    assignments, fortuneTellerRedHerringPlayerId: null, demonBluffs: [],
  };
  await prisma.setupDraft.create({
    data: { gameId, generatorVersion: 1, seed: "t", candidateJson: candidate as never, regenerationIndex: 0, committedAt: new Date(), setupHash: "t" },
  });
  for (const a of assignments) {
    await prisma.playerSecret.create({
      data: { playerId: a.playerId, trueCharacterId: a.trueCharacterId, perceivedCharacterId: a.perceivedCharacterId, trueAlignment: a.trueAlignment, abilityStateJson: {} },
    });
  }
  await prisma.gameSession.update({ where: { id: gameId }, data: { status: "ROLE_REVEAL", scriptId: "TROUBLE_BREWING", scriptVersion: 1 } });
  const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  return { gameId, playerIds, version: game.version };
}

async function runFirstCycle(gameId: string, version: number, playerIds: string[]): Promise<number> {
  let v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
  for (let g = 0; g < 200; g += 1) {
    const st = await loadStorytellerData(gameId);
    const active = (st.operational?.actions ?? []).find((a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER");
    if (!active) break;
    if (active.status === "WAITING_FOR_PLAYER") {
      v = (await submitAction({ gameId, playerId: active.actorPlayerId!, actionId: active.id, commandId: randomUUID(), expectedVersion: v, targetPlayerIds: defaultActionTargets(active.kind, active.actorPlayerId!, playerIds) })).version;
    } else {
      v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
    }
  }
  return (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
}

// ---- Spec §19 asset tests: dimensions must be identical across all files ----

/** PNG IHDR dimensions (bytes 16–23, big-endian). */
function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.toString("ascii", 1, 4)).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** WebP dimensions — handles VP8 (lossy), VP8L (lossless) and VP8X (extended). */
function webpSize(buf: Buffer): { width: number; height: number } {
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WEBP");
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8X") {
    // Canvas size minus one: 3 bytes LE each, at offset 24 / 27.
    return {
      width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
      height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
    };
  }
  if (fourcc === "VP8L") {
    // Signature byte at 20, then 14 bits width-1 / 14 bits height-1 (LE).
    const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
    return {
      width: 1 + (b0 | ((b1 & 0x3f) << 8)),
      height: 1 + ((b2 << 2) | ((b1 & 0xc0) >> 6) | ((b3 & 0x0f) << 10)),
    };
  }
  // VP8 lossy frame: 0x9D 0x01 0x2A tag at offset 23, then 14-bit dims LE.
  expect(buf[23]).toBe(0x9d);
  return {
    width: (buf[26] | (buf[27] << 8)) & 0x3fff,
    height: (buf[28] | (buf[29] << 8)) & 0x3fff,
  };
}

function readAsset(rel: string): Buffer {
  return readFileSync(path.join(process.cwd(), rel));
}

function exists(rel: string): boolean {
  return existsSync(path.join(process.cwd(), rel));
}

function walkDir(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walkDir(rel));
    else out.push(rel);
  }
  return out;
}

describe("Map system — asset pipeline (spec §19)", () => {
  it("base, reveal and master assets share identical canvas dimensions", () => {
    const baseWebp = webpSize(readAsset("public/maps/sieski/map-base-029178c4b18a.webp"));
    const revealWebp = webpSize(readAsset("assets/maps/sieski/map-west-reveal-3c1b1cdf7268.webp"));
    const basePng = pngSize(readAsset("assets/maps/sieski/the-sies-files-map-base.png"));
    const masterPng = pngSize(readAsset("assets/maps/sieski/the-sies-files-map-master.png"));
    const revealPng = pngSize(readAsset("assets/maps/sieski/the-sies-files-map-west-reveal.png"));

    expect(baseWebp).toEqual({ width: 1448, height: 1086 });
    for (const other of [revealWebp, basePng, masterPng, revealPng]) {
      expect(other).toEqual(baseWebp);
    }
  });

  it("protected reveal asset is readable through the asset accessor only", async () => {
    const asset = await readProtectedLayerAsset("WEST_AREA");
    expect(asset).not.toBeNull();
    expect(asset?.contentType).toBe("image/webp");
    expect(asset?.data.byteLength).toBeGreaterThan(1000);

    // Unknown layers never resolve (no path enumeration).
    expect(await readProtectedLayerAsset("SECRET_PATH")).toBeNull();
    expect(await readProtectedLayerAsset("../etc/passwd")).toBeNull();
  });

  it("no reveal, extended, or master artwork is publicly addressable (spec §8.2)", () => {
    const publicFiles = walkDir("public");
    const protectedNames = /reveal|master|extended/i;
    const offenders = publicFiles.filter((f) => protectedNames.test(f));
    expect(offenders).toEqual([]);
    // The reveal webp and master PNG live exclusively under the private tree.
    expect(exists("assets/maps/sieski/map-west-reveal-3c1b1cdf7268.webp")).toBe(true);
    expect(exists("assets/maps/sieski/the-sies-files-map-master.png")).toBe(true);
    expect(exists("public/maps/sieski/map-base-029178c4b18a.webp")).toBe(true);
  });
});

describe("Map system — layer model (spec §5)", () => {
  const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);

  it("has exactly one unlocked-by-default BASE layer", () => {
    expect(MAP_LAYERS.filter((l) => l.unlockedByDefault).map((l) => l.id)).toEqual(["BASE"]);
    expect(MAP_LAYERS.map((l) => l.zIndex)).toEqual([0, 10]);
  });

  it("derives unlocked layers from the active map version", () => {
    expect(layersUnlockedByMapVersion(def, "MAP_BASE")).toEqual(["BASE"]);
    expect(layersUnlockedByMapVersion(def, "MAP_EXTENDED")).toEqual(["BASE", "WEST_AREA"]);
    // Null / unknown versions fall back to the initial version (no leaks).
    expect(layersUnlockedByMapVersion(def, null)).toEqual(["BASE"]);
    expect(layersUnlockedByMapVersion(def, "DOES_NOT_EXIST")).toEqual(["BASE"]);
  });

  it("builds the initial map state without scenario state (revision 1, BASE only)", () => {
    const dto = buildMapStateDto({ gameId: "g1", scenarioState: null, def });
    expect(dto.revision).toBe(1);
    expect(dto.layers).toHaveLength(1);
    expect(dto.layers[0].id).toBe("BASE");
    expect(dto.layers[0].url).toBe(MAP_BASE_PUBLIC_URL);
    expect(dto.pois.every((p) => p.layerId === "BASE")).toBe(true);
    expect(dto.pois.some((p) => p.id === "HERMITAGE")).toBe(false);
    expect(dto.pois.some((p) => p.id === "HOUSE")).toBe(true);
  });

  it("revision helpers increment and preserve other stateJson keys", () => {
    expect(getMapRevision(null)).toBe(1);
    const first = nextMapRevision(null);
    expect(first).toEqual({ revision: 2, stateJson: { mapRevision: 2 } });
    const second = nextMapRevision({ stateJson: first.stateJson });
    expect(second.revision).toBe(3);
    const withExtra = nextMapRevision({ stateJson: { mapRevision: 3, discoveredPoiIds: ["X"] } });
    expect(withExtra).toEqual({ revision: 4, stateJson: { mapRevision: 4, discoveredPoiIds: ["X"] } });
  });
});

describe("Map system — camera math (spec §9)", () => {
  const expectRect = (r: Rect, x0: number, y0: number, x1: number, y1: number) => {
    expect(r.x0).toBeCloseTo(x0, 6);
    expect(r.y0).toBeCloseTo(y0, 6);
    expect(r.x1).toBeCloseTo(x1, 6);
    expect(r.y1).toBeCloseTo(y1, 6);
  };

  it("initial view sits inside the pre-reveal world bounds", () => {
    const clamped = clampRect(INITIAL_VIEW, PRE_WORLD, PRE_MIN_SCALE, PRE_MAX_SCALE);
    expectRect(clamped, INITIAL_VIEW.x0, INITIAL_VIEW.y0, INITIAL_VIEW.x1, INITIAL_VIEW.y1);
    expect(clamped.x0).toBeGreaterThanOrEqual(PRE_WORLD.xMin);
    expect(clamped.x1).toBeLessThanOrEqual(PRE_WORLD.xMax);
  });

  it("panning cannot enter the hidden western world before the reveal", () => {
    const left = panRect(INITIAL_VIEW, -0.5, 0, PRE_WORLD, PRE_MIN_SCALE, PRE_MAX_SCALE);
    expect(left.x0).toBeCloseTo(PRE_WORLD.xMin, 6);
    const right = panRect(INITIAL_VIEW, 0.5, 0, PRE_WORLD, PRE_MIN_SCALE, PRE_MAX_SCALE);
    expect(right.x1).toBeCloseTo(PRE_WORLD.xMax, 6);
    const down = panRect(INITIAL_VIEW, 0, 0.5, PRE_WORLD, PRE_MIN_SCALE, PRE_MAX_SCALE);
    expect(down.y1).toBeCloseTo(PRE_WORLD.yMax, 6);
  });

  it("minimum zoom prevents zooming out beyond the stage framing", () => {
    const zoomedOut = zoomRectAbout(INITIAL_VIEW, 0.7, 0.4, 0.1, PRE_WORLD, PRE_MIN_SCALE, PRE_MAX_SCALE);
    expect(rectScale(zoomedOut)).toBeCloseTo(PRE_MIN_SCALE, 6);
    // After the reveal, zooming out can reach the whole canvas.
    const full = zoomRectAbout(FULL_VIEW, 0.5, 0.375, 0.1, POST_WORLD, 1, 3);
    expectRect(full, 0, 0, 1, 0.75);
  });

  it("zoomRectAbout keeps the focal point stationary (within zoom limits)", () => {
    const fx = 0.72;
    const fy = 0.31;
    // Scale after zoom: 1/0.54 × 1.3 ≈ 2.4 — inside the 2.5 max.
    const zoomed = zoomRectAbout(INITIAL_VIEW, fx, fy, 1.3, PRE_WORLD, PRE_MIN_SCALE, PRE_MAX_SCALE);
    const rx = (fx - zoomed.x0) / (zoomed.x1 - zoomed.x0);
    const ry = (fy - zoomed.y0) / (zoomed.y1 - zoomed.y0);
    expect(rx).toBeCloseTo((fx - INITIAL_VIEW.x0) / (INITIAL_VIEW.x1 - INITIAL_VIEW.x0), 6);
    expect(ry).toBeCloseTo((fy - INITIAL_VIEW.y0) / (INITIAL_VIEW.y1 - INITIAL_VIEW.y0), 6);
  });

  it("rectToCss always renders the world at the exact 4:3 canvas ratio", () => {
    for (const rect of [INITIAL_VIEW, FULL_VIEW, { x0: 0.5, y0: 0.2, x1: 0.8, y1: 0.5 }]) {
      const css = rectToCss(rect);
      // World pixel aspect = viewport aspect × normalized rect aspect = 4:3.
      const worldPxAspect = css.aspect * ((rect.y1 - rect.y0) / (rect.x1 - rect.x0));
      expect(worldPxAspect).toBeCloseTo(4 / 3, 6);
      expect(css.aspect).toBeCloseTo(
        ((rect.x1 - rect.x0) * 1448) / ((rect.y1 - rect.y0) * 1086),
        6,
      );
    }
  });

  it("tweenRect honors reduced motion by jumping to the destination", () => {
    const frames: Rect[] = [];
    let done = false;
    const cancel = tweenRect(INITIAL_VIEW, FULL_VIEW, 1400, (r) => frames.push(r), () => (done = true), true);
    expect(frames).toHaveLength(1);
    expectRect(frames[0], 0, 0, 1, 0.75);
    expect(done).toBe(true);
    expect(cancel).toBeTypeOf("function");
  });

  it("tweenRect can be cancelled mid-flight", () => {
    const raf = vi.fn();
    const caf = vi.fn();
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = raf as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = caf;
    try {
      const frames: Rect[] = [];
      let done = false;
      const cancel = tweenRect(INITIAL_VIEW, FULL_VIEW, 1400, (r) => frames.push(r), () => (done = true), false);
      expect(raf).toHaveBeenCalled();
      cancel();
      expect(caf).toHaveBeenCalled();
      expect(done).toBe(false);
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCaf;
    }
  });
});

describe("Map system — server-authoritative unlock (spec §7, §19)", () => {
  it("before unlock the projection exposes BASE only, with no western URL or POIs", async () => {
    const { gameId, playerIds, version } = await commitCustomSetup();
    const v = await runFirstCycle(gameId, version, playerIds);

    // Start the scenario (creates ScenarioState at MAP_BASE) without unlocking.
    await scanQr({ gameId, playerId: playerIds[0], token: "tsf-qr-letter-001", commandId: randomUUID(), expectedVersion: v });

    const data = await loadStorytellerData(gameId);
    const projection = buildStorytellerProjection(data.game, data.players, [], data);

    expect(projection.scenario).not.toBeNull();
    const map = projection.scenario!.map;
    expect(map).not.toBeNull();
    expect(map!.revision).toBe(1);
    expect(map!.layers.map((l) => l.id)).toEqual(["BASE"]);
    expect(map!.layers.every((l) => !l.url.includes("WEST_AREA"))).toBe(true);
    expect(map!.pois.some((p) => p.layerId === "WEST_AREA")).toBe(false);
    expect(map!.pois.every((p) => p.layerId === "BASE")).toBe(true);
  });

  it("annex QR unlocks WEST_AREA: revision bumps, layer + POIs become authorized", async () => {
    const { gameId, playerIds, version } = await commitCustomSetup();
    const v = await runFirstCycle(gameId, version, playerIds);

    await scanQr({ gameId, playerId: playerIds[0], token: "tsf-qr-annex-001", commandId: randomUUID(), expectedVersion: v });

    const state = await prisma.scenarioState.findUniqueOrThrow({ where: { gameId } });
    expect(state.mapVersionId).toBe("MAP_EXTENDED");
    expect(getMapRevision(state)).toBe(2);

    const dto = buildMapStateDto({ gameId, scenarioState: state, def: getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1) });
    expect(dto.revision).toBe(2);
    expect(dto.layers.map((l) => l.id)).toEqual(["BASE", "WEST_AREA"]);
    const west = dto.layers.find((l) => l.id === "WEST_AREA");
    expect(west?.url).toBe(`/api/v1/games/${gameId}/map/layers/WEST_AREA`);
    expect(dto.pois.some((p) => p.id === "HERMITAGE")).toBe(true);
    expect(dto.pois.some((p) => p.id === "WEST_PATH")).toBe(true);
  });

  it("every POI sits inside the canonical canvas and belongs to a known layer", () => {
    const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);
    const layerIds = new Set<MapLayerId>(MAP_LAYERS.map((l) => l.id));
    for (const poi of def.pois) {
      expect(layerIds.has(poi.layerId)).toBe(true);
      expect(poi.x).toBeGreaterThanOrEqual(0);
      expect(poi.x).toBeLessThanOrEqual(1);
      expect(poi.y).toBeGreaterThanOrEqual(0);
      expect(poi.y).toBeLessThanOrEqual(0.75);
      expect(poi.label.trim().length).toBeGreaterThan(0);
    }
  });
});
