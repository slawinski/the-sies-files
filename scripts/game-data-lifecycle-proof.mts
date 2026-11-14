import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { resolveTarget } from './test-database.mjs';
import { buildIdentity, derivedTarget, ownedDatabase, preflight } from './playable-recovery.mjs';
import { verifySource, type capture } from './regression-baseline.mjs';
import { execute, restoreCheck, LifecycleFailure, type Options } from './game-data-lifecycle.mjs';
import { bytesDigest, digest, identities, readGraph, selection } from './game-data-policy.mjs';
import { writePrivate } from './game-data-journal.mjs';
import { proveBrowserLifecycle } from './game-data-lifecycle-browser.mjs';

type ProofOptions = { output: string; manifest?: string; buildRecord?: string };
type Hooks = { stage?: (name: string, archive: string) => void };
type Report = {
  format: string; complete: boolean; startedAt: string; node: string;
  attribution: { lifecycle: ReturnType<typeof identities>; sourceId: string | null; build: ReturnType<typeof buildIdentity> | null };
  versions?: ReturnType<typeof preflight>;
  databases?: unknown;
  observations: Record<string, unknown>;
  stages: { name: string; exit?: number | null; at: string }[];
  failureStage?: string; cleanupFailure?: string;
  lifecycleFailure?: LifecycleFailure['report'];
  cleanup: { source: string; staging: string };
};

// These are existing native integration cases, not summary claims invented by
// this runner. The canonical unit stage must actually discover and pass each.
export const LIFECYCLE_WITNESSES = [
  'real CLI purges all 22 families, retaining the complete other game and global budget',
  'reconciles committed-but-unobserved deletion without selecting or deleting again',
  ...['history-FK', 'zero-residue', 'before-commit'].map(k => 'rolls the actual complete transaction back after deletion starts: ' + k),
  ...['pending-file', 'pending-directory', 'final-file', 'final-rename', 'final-directory'].map(k => 'injects a real filesystem failure at ' + k + ' and reconciles exact committed evidence only'),
  'refuses held locks/sessions and leaves the owning transaction alive',
  ...['claim-retry', 'recovery', 'heartbeat'].map(k => 'drains an actually admitted ' + k + ' before native offline apply, then its fresh root/session recheck refuses'),
] as const;
const PHYSICAL_STAGES = ['preflight', 'create-source', 'fixture', 'dump', 'complete-archive', 'retire-source', 'create-staging', 'restore', 'observation', 'manual-staging-reconciliation', 'verified'];
export const LIFECYCLE_BROWSER_CASE = 'E2E-14 offline purge restart clears mounted private state and delayed archive outcome';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const buildSchema = z.object({ sourceId: sha, id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), lockSha256: sha, artifactSha256: sha, schemaSha256: sha, migrationsSha256: sha }).strict();
const summarySchema = z.object({
  format: z.literal('game-data-lifecycle-canonical/1'), complete: z.boolean(), sourceId: sha, build: buildSchema,
  proof: z.object({ implementation: sha, policy: sha, tool: sha, sourceSchema: sha, fixture: z.literal('lifecycle-synthetic-v1') }).strict(),
  stages: z.array(z.object({ id: z.enum([...PHYSICAL_STAGES, 'browser-offline-purge']), status: z.enum(['passed', 'failed']), exit: z.number().int().nullable() }).strict()),
  native: z.array(z.object({ file: z.literal('tests/game-data-lifecycle.test.ts'), title: z.enum(LIFECYCLE_WITNESSES), status: z.enum(['passed', 'failed', 'skipped', 'pending']) }).strict()),
  browser: z.object({ id: z.literal(LIFECYCLE_BROWSER_CASE), status: z.enum(['passed', 'failed']), assertions: z.number().int().min(0).max(26) }).strict(),
  cleanup: z.object({ source: z.literal('released'), staging: z.literal('released') }).strict(),
}).strict();
function proofIdentity() {
  const id = identities();
  return { implementation: digest(['game-data-lifecycle-proof.mts', 'game-data-lifecycle-browser.mts'].map(n => bytesDigest(fs.readFileSync(new URL(n, import.meta.url))))),
    policy: id.policy, tool: id.tool, sourceSchema: id.sourceSchema, fixture: 'lifecycle-synthetic-v1' as const };
}
function nativeWitnesses(out: string) {
  const discovery = JSON.parse(fs.readFileSync(path.join(out, 'unit-discovery.json'), 'utf8')) as { file: string; name: string }[];
  const native = JSON.parse(fs.readFileSync(path.join(out, 'unit.json'), 'utf8')) as { testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[] };
  return LIFECYCLE_WITNESSES.map(title => {
    const file = 'tests/game-data-lifecycle.test.ts' as const;
    const discovered = discovery.filter(t => t.file.replaceAll('\\', '/').endsWith('/' + file) || t.file === file).filter(t => t.name === title);
    const results = native.testResults.filter(t => t.name.replaceAll('\\', '/').endsWith('/' + file) || t.name === file).flatMap(t => t.assertionResults).filter(t => t.fullName === title);
    if (discovered.length !== 1 || results.length !== 1 || results[0].status !== 'passed') throw new Error('Missing or failed native lifecycle witness');
    return { file, title, status: 'passed' as const };
  });
}
/** All expectations come from the caller's captured manifest/build and actual
 * native files, never from source/build selectors supplied by the report. */
export function readLifecycleReport(out: string, work: string, manifest: ReturnType<typeof capture>, expectedBuild: ReturnType<typeof buildIdentity>, nativeOut: string) {
  const report = summarySchema.parse(JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')));
  if (bytesDigest(JSON.stringify(manifest.entries)) !== manifest.sourceId || verifySource(manifest, work).length ||
      !report.complete || report.sourceId !== manifest.sourceId || expectedBuild.sourceId !== manifest.sourceId ||
      digest(report.build) !== digest(expectedBuild) || digest(buildIdentity(work, manifest.sourceId)) !== digest(expectedBuild) ||
      digest(report.proof) !== digest(proofIdentity()) || digest(report.native) !== digest(nativeWitnesses(nativeOut)) ||
      digest(report.stages.map(s => s.id)) !== digest([...PHYSICAL_STAGES, 'browser-offline-purge']) ||
      report.stages.some(s => s.status !== 'passed' || s.exit !== 0) || report.browser.status !== 'passed' || report.browser.assertions !== 26) throw new Error('Incomplete or mismatched lifecycle evidence');
  return report;
}

/** Synthetic physical proof only. Never adopts the database named by the URL. */
export async function proveLifecycle(options: ProofOptions, hooks: Hooks = {}): Promise<Report> {
  const base = resolveTarget();
  const out = path.resolve(options.output);
  fs.mkdirSync(out, { mode: 0o700 }); // exclusive new run; failed reports are never replaced
  const custody = path.join(out, 'custody'); fs.mkdirSync(custody, { mode: 0o700 });
  const archive = path.join(custody, 'old-active.dump');
  const cwd = process.cwd();
  let manifest: ReturnType<typeof capture> | undefined;
  let recorded: { sourceId: string; build: ReturnType<typeof buildIdentity> } | undefined;
  let browserResult: { id: typeof LIFECYCLE_BROWSER_CASE; status: 'passed' | 'failed'; assertions: number } = { id: LIFECYCLE_BROWSER_CASE, status: 'failed', assertions: 0 };
  const report: Report = { format: 'game-data-lifecycle-proof/1', complete: false, startedAt: new Date().toISOString(), node: process.version,
    attribution: { lifecycle: identities(), sourceId: null, build: null }, observations: {}, stages: [], cleanup: { source: 'not-allocated', staging: 'not-allocated' } };
  const save = () => fs.writeFileSync(path.join(out, 'lifecycle.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  save();
  let stage = 'preflight'; let cancelled = false;
  const cancel = () => { cancelled = true; };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  const enter = (name: string) => {
    const previous = report.stages.findLast(s => !s.name.includes(':'));
    if (previous) previous.exit = 0;
    stage = name; report.stages.push({ name, at: new Date().toISOString() }); save();
    if (cancelled) throw new Error('Cancelled');
    hooks.stage?.(name, archive);
  };
  const command = (exe: string, args: string[], env: NodeJS.ProcessEnv) => {
    const r = spawnSync(exe, args, { cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    report.stages.push({ name: stage + ':' + path.basename(exe), exit: r.status, at: new Date().toISOString() }); save();
    if (r.status !== 0 || cancelled) throw new Error('Physical stage failed');
  };
  let source: ReturnType<typeof ownedDatabase> | undefined;
  let browserPort: number | undefined;
  let staging: ReturnType<typeof ownedDatabase> | undefined;
  let db: PrismaClient | undefined; let restored: PrismaClient | undefined;
  try {
    enter('preflight'); report.versions = preflight(base);
    if (options.buildRecord) {
      if (options.manifest) throw new Error('One attribution mode required');
      recorded = JSON.parse(fs.readFileSync(options.buildRecord, 'utf8'));
      manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(options.buildRecord), 'capsule/manifest.json'), 'utf8'));
      if (!manifest || !recorded || recorded.sourceId !== manifest.sourceId || bytesDigest(JSON.stringify(manifest.entries)) !== manifest.sourceId || verifySource(manifest, cwd).length || digest(buildIdentity(cwd, manifest.sourceId)) !== digest(recorded.build)) throw new Error('Recorded build mismatch');
      report.attribution.sourceId = manifest.sourceId; report.attribution.build = recorded.build;
      nativeWitnesses(path.dirname(options.buildRecord));
    }
    if (options.manifest) {
      manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
      if (!manifest || verifySource(manifest, cwd).length) throw new Error('Source mismatch');
      report.attribution.sourceId = manifest.sourceId;
    }
    if (options.buildRecord) {
      const portProbe = net.createServer();
      await new Promise<void>((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(0, '127.0.0.1', resolve); });
      browserPort = (portProbe.address() as net.AddressInfo).port;
      await new Promise<void>((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));
    }
    source = ownedDatabase(derivedTarget(base, 'source'), browserPort);
    staging = ownedDatabase(derivedTarget(base, 'target'));
    report.cleanup = { source: 'pending', staging: 'pending' };
    report.databases = { source: source.target.public, staging: staging.target.public };
    enter('create-source'); source.create();
    command(path.join(cwd, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], source.target.env);
    db = new PrismaClient({ datasourceUrl: source.target.env.DATABASE_URL!, log: [], errorFormat: 'minimal' });
    enter('fixture');
    const retired = await db.gameSession.create({ data: { name: 'SYNTHETIC_PRIVATE_PROOF', status: 'ACTIVE', phase: 'INVESTIGATION' } });
    await db.player.create({ data: { gameId: retired.id, displayName: 'SYNTHETIC_PRIVATE_PLAYER', virtualSeat: 1,
      secret: { create: { trueCharacterId: 'CHEF' } } } });
    const other = await db.gameSession.create({ data: { name: 'SYNTHETIC_OTHER', status: 'ACTIVE', phase: 'OPERATIONAL' } });
    const retainedDigest = selection(await db.$transaction(tx => readGraph(tx)), other.id).data;
    report.observations.identities = { retired: { game: retired.id, createdAt: retired.createdAt.toISOString() }, other: { game: other.id, createdAt: other.createdAt.toISOString() } };
    await db.$disconnect();
    enter('dump'); command('pg_dump', ['--format=custom', '--file=' + archive], source.target.env);
    enter('complete-archive');
    // Use actual command handlers in a fresh process bound only to the owned source.
    command(path.join(cwd, 'node_modules/.bin/tsx'), ['-e', `import {closeInvestigation} from './src/modules/investigation/investigation.service'; import {archiveGame} from './src/modules/game-session/game-session.service'; import {prisma} from './src/lib/db'; (async()=>{const ended=await closeInvestigation({gameId:${JSON.stringify(retired.id)},commandId:${JSON.stringify(randomUUID())},expectedVersion:0}); if(!ended.winner) throw new Error('No completion'); await archiveGame({gameId:${JSON.stringify(retired.id)},commandId:${JSON.stringify(randomUUID())},expectedVersion:ended.version});})().finally(()=>prisma.$disconnect());`], source.target.env);
    const database = new URL(source.target.env.DATABASE_URL!); database.password = '';
    const opts: Options = { database: database.href, game: retired.id, request: randomUUID(), plan: path.join(custody, 'plan.json'), journal: path.join(custody, 'intent.json'), receipt: path.join(custody, 'receipt.json'), stoppedApplication: true };
    enter('retire-source'); await execute('plan', opts); await execute('apply', opts);
    const evidence = path.join(custody, 'collection.json');
    writePrivate(evidence, { format: 'game-retirement-custody/1', complete: true, entries: [{ journal: opts.journal, receipt: opts.receipt }] });
    report.observations.sourceRemaining = await db.gameSession.count();
    if (report.observations.sourceRemaining !== 1 || await db.gameSession.findUnique({ where: { id: retired.id } })) throw new Error('Source residue');
    await db.$disconnect();
    enter('create-staging'); staging.create();
    enter('restore'); command('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname=' + staging.target.database, archive], staging.target.env);
    const stagingURL = new URL(staging.target.env.DATABASE_URL!); stagingURL.password = '';
    restored = new PrismaClient({ datasourceUrl: staging.target.env.DATABASE_URL!, log: [], errorFormat: 'minimal' });
    enter('observation');
    report.observations.oldRoot = await restored.gameSession.findUniqueOrThrow({ where: { id: retired.id }, select: { id: true, createdAt: true, status: true, archivedAt: true } });
    report.observations.oldAnchorCount = await restored.gameRetirement.count();
    if ((report.observations.oldRoot as { status: string; archivedAt: unknown }).status !== 'ACTIVE' || (report.observations.oldRoot as { archivedAt: unknown }).archivedAt !== null || report.observations.oldAnchorCount !== 0) throw new Error('Not an old active copy');
    await restored.$disconnect();
    const checkOptions = { database: stagingURL.href, evidence, unservedStaging: true as const };
    const blocked = await restoreCheck(checkOptions); report.observations.blocked = blocked;
    if (blocked.outcome !== 'blocked' || !('conflicts' in blocked) || blocked.conflicts[0]?.kind !== 'committed' || blocked.conflicts[0]?.game !== retired.id) throw new Error('Retirement not detected');
    const liveOptions = { ...opts, database: stagingURL.href, request: randomUUID(), plan: path.join(custody, 'live-plan.json'), journal: path.join(custody, 'live-intent.json'), receipt: path.join(custody, 'live-receipt.json') };
    // Ordinary planning/apply must never turn restore detection into eligibility.
    let refused = false;
    try { await execute('plan', liveOptions); } catch { refused = true; }
    let applyRefused = false;
    try { await execute('apply', liveOptions); } catch { applyRefused = true; }
    report.observations.liveApplyRefused = refused && applyRefused;
    if (!refused || !applyRefused) throw new Error('Live root admitted');
    enter('manual-staging-reconciliation');
    // Deliberate proof-only SQL on the new, unserved, lease-owned staging copy.
    // No operator automatic reconciliation mode or live eligibility exception.
    await restored.$transaction(async tx => {
      const roots = await tx.$queryRaw<{ createdAt: Date }[]>`SELECT "createdAt" FROM public.game_sessions WHERE id=${retired.id} FOR UPDATE`;
      if (roots.length !== 1 || roots[0].createdAt.toISOString() !== retired.createdAt.toISOString()) throw new Error('Staging identity changed');
      for (const table of ['domain_events','command_receipts','checkpoints','presence']) await tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw('public."' + table + '"')} WHERE "gameId"=${retired.id}`);
      await tx.gameSession.delete({ where: { id: retired.id } });
    });
    const otherDigest = selection(await restored.$transaction(tx => readGraph(tx)), other.id).data;
    report.observations.otherUnchanged = otherDigest === retainedDigest;
    report.observations.stagingRemaining = await restored.gameSession.count();
    if (!report.observations.otherUnchanged || report.observations.stagingRemaining !== 1) throw new Error('Other game changed');
    await restored.$disconnect();
    report.observations.rechecked = await restoreCheck(checkOptions);
    if ((report.observations.rechecked as { outcome: string }).outcome !== 'clear') throw new Error('Recheck failed');
    if (options.buildRecord) {
      enter('browser-offline-purge');
      browserResult = await proveBrowserLifecycle(source.target, db, custody, report.attribution.build!, browserPort!, command);
    }
    enter('verified');
    report.stages.at(-1)!.exit = 0;
   } catch (error) {
     report.failureStage = stage;
     if (error instanceof LifecycleFailure) report.lifecycleFailure = error.report;
   }
  finally {
    await db?.$disconnect(); await restored?.$disconnect();
    try { hooks.stage?.('cleanup', archive); } catch { report.cleanupFailure = 'cleanup'; }
    for (const [name, owned] of [['staging', staging], ['source', source]] as const) {
      if (!owned) continue;
      try { owned.cleanup(); report.cleanup[name] = 'released'; }
      catch { report.cleanup[name] = 'failed-ownership-or-drop'; report.cleanupFailure = 'cleanup'; }
    }
    if (manifest) {
      try { if (verifySource(manifest, cwd).length) report.failureStage ??= 'source-fingerprint'; }
      catch { report.failureStage ??= 'source-fingerprint'; }
    }
    if (recorded) {
      try { if (digest(buildIdentity(cwd, recorded.sourceId)) !== digest(recorded.build)) report.failureStage ??= 'build-fingerprint'; }
      catch { report.failureStage ??= 'build-fingerprint'; }
    }
    if (cancelled) report.failureStage ??= 'cancelled';
    report.complete = !report.failureStage && !report.cleanupFailure && stage === 'verified';
    if (options.buildRecord && recorded && manifest) {
      // Explicit public allowlist. lifecycle.json and the custody tree remain
      // private, including on failure. Never copy raw native errors or DTOs.
      try {
        const summary = { format: 'game-data-lifecycle-canonical/1', complete: report.complete, sourceId: manifest.sourceId, build: recorded.build, proof: proofIdentity(),
          stages: [...PHYSICAL_STAGES, 'browser-offline-purge'].map(id => {
            const observed = report.stages.find(s => s.name === id);
            return { id, status: observed?.exit === 0 ? 'passed' : 'failed', exit: observed?.exit ?? null };
          }),
          native: nativeWitnesses(path.dirname(options.buildRecord)), browser: browserResult, cleanup: report.cleanup };
        fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
        readLifecycleReport(out, cwd, manifest, recorded.build, path.dirname(options.buildRecord));
      } catch { report.complete = false; report.failureStage ??= 'canonical-report'; }
    }
    save(); process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--output' || !['--manifest', '--build-record'].includes(args[2])) throw new Error('Explicit output and capsule attribution required');
    const report = await proveLifecycle({ output: args[1], ...(args[2] === '--manifest' ? { manifest: args[3] } : { buildRecord: args[3] }) });
    console.log(JSON.stringify({ complete: report.complete, failureStage: report.failureStage, cleanupFailure: report.cleanupFailure }));
    if (!report.complete) process.exitCode = 1;
  } catch { console.log(JSON.stringify({ complete: false, failureStage: 'arguments-or-output' })); process.exitCode = 1; }
}
