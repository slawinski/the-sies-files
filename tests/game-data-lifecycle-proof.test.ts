import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { proveLifecycle } from "../scripts/game-data-lifecycle-proof.mjs";

it("physically restores a pre-retirement ACTIVE PG16 backup and reconciles only owned unserved staging", async () => {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u4-proof-test-"));
  const report = await proveLifecycle({ output: path.join(parent, "success") });
  expect(report.complete).toBe(true);
  expect(report.observations).toMatchObject({ oldRoot: { status: "ACTIVE", archivedAt: null }, oldAnchorCount: 0,
    blocked: { outcome: "blocked", conflictCount: 1 }, rechecked: { outcome: "clear", conflictCount: 0 },
    sourceRemaining: 1, stagingRemaining: 1, otherUnchanged: true, liveApplyRefused: true });
  expect(report.cleanup).toEqual({ source: "released", staging: "released" });
});

it.each(["dump", "restore", "observation", "cleanup"] as const)("keeps a failed %s proof nonzero-equivalent with a durable report and owned cleanup", async fault => {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "u4-proof-failure-"));
  const output = path.join(parent, "failure");
  const report = await proveLifecycle({ output }, { stage(name, archive) {
    if (name !== fault) return;
    if (fault === "dump") fs.mkdirSync(archive);
    else if (fault === "restore") fs.truncateSync(archive, 20);
    else throw new Error("SYNTHETIC_PRIVATE_FAILURE");
  } });
  expect(report.complete).toBe(false);
  expect(report.failureStage ?? report.cleanupFailure).toBe(fault);
  expect(report.cleanup).toEqual({ source: "released", staging: "released" });
  const stored = fs.readFileSync(path.join(output, "lifecycle.json"), "utf8");
  expect(JSON.parse(stored).complete).toBe(false);
  expect(stored).not.toContain("SYNTHETIC_PRIVATE_FAILURE");
});
