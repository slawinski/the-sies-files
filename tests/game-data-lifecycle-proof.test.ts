import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { execFileSync } from 'node:child_process';
import { proveLifecycle, readLifecycleReport, LIFECYCLE_WITNESSES, LIFECYCLE_BROWSER_CASE } from "../scripts/game-data-lifecycle-proof.mjs";
import { capture } from '../scripts/regression-baseline.mjs';
import { buildIdentity } from '../scripts/playable-recovery.mjs';
import { bytesDigest, digest, identities } from '../scripts/game-data-policy.mjs';

function reportFixture() {
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'u5-ingestion-'));
  const work = path.join(parent, 'source'), out = path.join(parent, 'reports');
  fs.mkdirSync(work); fs.mkdirSync(out);
  fs.mkdirSync(path.join(work, 'prisma/migrations'), { recursive: true });
  fs.writeFileSync(path.join(work, 'prisma/schema.prisma'), 'synthetic schema');
  fs.writeFileSync(path.join(work, 'package-lock.json'), '{}');
  execFileSync('git', ['init', '-q'], { cwd: work });
  execFileSync('git', ['add', '.'], { cwd: work });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], { cwd: work });
  const manifest = capture(work);
  fs.mkdirSync(path.join(work, '.next')); fs.writeFileSync(path.join(work, '.next/BUILD_ID'), 'synthetic-build');
  const build = buildIdentity(work, manifest.sourceId), identity = identities();
  const native = LIFECYCLE_WITNESSES.map(title => ({ file: 'tests/game-data-lifecycle.test.ts', title, status: 'passed' }));
  const discovery = native.map(t => ({ file: t.file, name: t.title }));
  const outcomes = { testResults: [{ name: native[0].file, assertionResults: native.map(t => ({ fullName: t.title, status: t.status })) }] };
  fs.writeFileSync(path.join(out, 'unit-discovery.json'), JSON.stringify(discovery));
  fs.writeFileSync(path.join(out, 'unit.json'), JSON.stringify(outcomes));
  const report = { format: 'game-data-lifecycle-canonical/1', complete: true, sourceId: manifest.sourceId, build,
    proof: { implementation: digest(['game-data-lifecycle-proof.mts', 'game-data-lifecycle-browser.mts'].map(n => bytesDigest(fs.readFileSync(path.join('scripts', n))))), policy: identity.policy, tool: identity.tool, sourceSchema: identity.sourceSchema, fixture: 'lifecycle-synthetic-v1' },
    stages: ['preflight', 'create-source', 'fixture', 'dump', 'complete-archive', 'retire-source', 'create-staging', 'restore', 'observation', 'manual-staging-reconciliation', 'verified', 'browser-offline-purge'].map(id => ({ id, status: 'passed', exit: 0 })),
    native, browser: { id: LIFECYCLE_BROWSER_CASE, status: 'passed', assertions: 26 }, cleanup: { source: 'released', staging: 'released' } };
  const write = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report)); write();
  return { parent, work, out, manifest, build, report, write, outcomes };
}

it('lifecycle report accepts only complete strictly sanitized recorded-build and actual native evidence', () => {
  const f = reportFixture();
  try { expect(readLifecycleReport(f.out, f.work, f.manifest, f.build, f.out).complete).toBe(true); }
  finally { fs.rmSync(f.parent, { recursive: true }); }
});

it.each(['missing', 'truncated', 'truncated-browser', 'failed', 'skipped', 'omitted-stage', 'source', 'build', 'native-failed', 'native-omitted', 'private-section', 'private-nested', 'selected-source-from-json', 'selected-build-from-json', 'artifact-drift'] as const)('lifecycle report rejects %s evidence independently of other green stages', kind => {
  const f = reportFixture();
  try {
    if (kind === 'failed') f.report.complete = false;
    if (kind === 'truncated-browser') f.report.browser.assertions = 1;
    if (kind === 'skipped') f.report.native[0].status = 'skipped';
    if (kind === 'omitted-stage') f.report.stages.pop();
    if (kind === 'source' || kind === 'selected-source-from-json') f.report.sourceId = 'a'.repeat(64);
    if (kind === 'build' || kind === 'selected-build-from-json') f.report.build.artifactSha256 = 'b'.repeat(64);
    if (kind === 'native-failed') f.outcomes.testResults[0].assertionResults[0].status = 'failed';
    if (kind === 'native-omitted') f.outcomes.testResults[0].assertionResults.pop();
    if (kind === 'private-section') Object.assign(f.report, { journal: 'PRIVATE_MARKER' });
    if (kind === 'private-nested') Object.assign(f.report.browser, { token: 'PRIVATE_MARKER' });
    if (kind === 'selected-source-from-json') { f.manifest.sourceId = f.report.sourceId; f.report.build.sourceId = f.report.sourceId; }
    if (kind === 'artifact-drift') fs.writeFileSync(path.join(f.work, '.next/BUILD_ID'), 'changed');
    f.write(); fs.writeFileSync(path.join(f.out, 'unit.json'), JSON.stringify(f.outcomes));
    if (kind === 'missing') fs.unlinkSync(path.join(f.out, 'summary.json'));
    if (kind === 'truncated') fs.writeFileSync(path.join(f.out, 'summary.json'), '{');
    expect(() => readLifecycleReport(f.out, f.work, f.manifest, f.build, f.out)).toThrow();
  } finally { fs.rmSync(f.parent, { recursive: true }); }
});

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
