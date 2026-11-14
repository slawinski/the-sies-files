import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PrismaClient, Prisma } from '@prisma/client';
import { resolveTarget } from './test-database.mjs';
import { derivedTarget, ownedDatabase, preflight } from './playable-recovery.mjs';
import { verifySource, type capture } from './regression-baseline.mjs';
import { execute, restoreCheck, LifecycleFailure, type Options } from './game-data-lifecycle.mjs';
import { identities, readGraph, selection } from './game-data-policy.mjs';
import { writePrivate } from './game-data-journal.mjs';

type ProofOptions = { output: string; manifest?: string };
type Hooks = { stage?: (name: string, archive: string) => void };
type Report = {
  format: string; complete: boolean; startedAt: string; node: string;
  attribution: { lifecycle: ReturnType<typeof identities>; sourceId: string | null; build: null };
  versions?: ReturnType<typeof preflight>;
  databases?: unknown;
  observations: Record<string, unknown>;
  stages: { name: string; exit?: number | null; at: string }[];
  failureStage?: string; cleanupFailure?: string;
  lifecycleFailure?: LifecycleFailure['report'];
  cleanup: { source: string; staging: string };
};

/** Synthetic physical proof only. Never adopts the database named by the URL. */
export async function proveLifecycle(options: ProofOptions, hooks: Hooks = {}): Promise<Report> {
  const base = resolveTarget();
  const out = path.resolve(options.output);
  fs.mkdirSync(out, { mode: 0o700 }); // exclusive new run; failed reports are never replaced
  const custody = path.join(out, 'custody'); fs.mkdirSync(custody, { mode: 0o700 });
  const archive = path.join(custody, 'old-active.dump');
  const cwd = process.cwd();
  let manifest: ReturnType<typeof capture> | undefined;
  const report: Report = { format: 'game-data-lifecycle-proof/1', complete: false, startedAt: new Date().toISOString(), node: process.version,
    attribution: { lifecycle: identities(), sourceId: null, build: null }, observations: {}, stages: [], cleanup: { source: 'not-allocated', staging: 'not-allocated' } };
  const save = () => fs.writeFileSync(path.join(out, 'lifecycle.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  save();
  let stage = 'preflight'; let cancelled = false;
  const cancel = () => { cancelled = true; };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  const enter = (name: string) => {
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
  let staging: ReturnType<typeof ownedDatabase> | undefined;
  let db: PrismaClient | undefined; let restored: PrismaClient | undefined;
  try {
    enter('preflight'); report.versions = preflight(base);
    if (options.manifest) {
      manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
      if (!manifest || verifySource(manifest, cwd).length) throw new Error('Source mismatch');
      report.attribution.sourceId = manifest.sourceId;
    }
    source = ownedDatabase(derivedTarget(base, 'source'));
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
    enter('verified');
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
    if (cancelled) report.failureStage ??= 'cancelled';
    report.complete = !report.failureStage && !report.cleanupFailure && stage === 'verified';
    save(); process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--output' || args[2] !== '--manifest') throw new Error('Explicit output and capsule manifest required');
    const report = await proveLifecycle({ output: args[1], manifest: args[3] });
    console.log(JSON.stringify({ complete: report.complete, failureStage: report.failureStage, cleanupFailure: report.cleanupFailure }));
    if (!report.complete) process.exitCode = 1;
  } catch { console.log(JSON.stringify({ complete: false, failureStage: 'arguments-or-output' })); process.exitCode = 1; }
}
