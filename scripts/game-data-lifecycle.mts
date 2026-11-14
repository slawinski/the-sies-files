import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { canonical, digest, identities, tables, tableSQL, checkSchema, readGraph, selection, zeroResidue } from './game-data-policy.mjs';
import { privatePath, readPrivate, writePrivate, pending, finalize, syncPrivate, type FileHook } from './game-data-journal.mjs';

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().datetime();
const targetSchema = z.object({ host: z.string(), port: z.number().int(), database: z.string(), oid: z.string().regex(/^\d+$/), cluster: z.string().regex(/^\d+$/) }).strict();
const planSchema = z.object({
  format: z.literal('game-cleanup-plan/1'), request: uuid, custody: hash,
  target: targetSchema, game: uuid, createdAt: timestamp, archivedAt: timestamp,
  status: z.literal('ENDED'), version: z.number().int().nonnegative(), sequence: z.number().int().nonnegative(),
  policy: hash, tool: hash, source: hash, sourceSchema: hash, schema: hash,
  data: hash, other: hash, counts: z.record(z.string(), z.number().int().nonnegative()),
}).strict();
type Plan = z.infer<typeof planSchema>;
const intentSchema = z.object({ format: z.literal('game-retirement-intent/1'), plan: planSchema, planDigest: hash, initiatorTag: uuid, startedAt: timestamp }).strict();
type Intent = z.infer<typeof intentSchema>;
const failureSchema = z.object({ format: z.literal('game-retirement-failure/1'), intentDigest: hash,
  stage: z.enum(['input','preflight','schema','selection','plan-file','pending','delete','zero-residue','anchor','commit','commit-observation','finalize']),
  state: z.enum(['not-deleted','rolled-back','uncertain','committed']), at: timestamp }).strict();
type Failure = z.infer<typeof failureSchema>;
const receiptSchema = z.object({ format: z.literal('game-retirement-receipt/1'), intent: intentSchema, intentDigest: hash,
  retiredAt: timestamp, firstFailure: failureSchema.nullable(), earlierAttempt: z.literal('pending-or-incomplete'), scope: z.literal('selected-database-only') }).strict();
const restoreOptionsSchema = z.object({ database: z.string(), evidence: z.string(), unservedStaging: z.literal(true) }).strict();
export type RestoreOptions = z.infer<typeof restoreOptionsSchema>;
// Completeness is a custodian assertion, not something a restored database can prove.
const custodySchema = z.object({ format: z.literal('game-retirement-custody/1'), complete: z.literal(true),
  entries: z.array(z.object({ journal: z.string(), receipt: z.string().nullable() }).strict()).max(1000) }).strict();
const optionsSchema = z.object({ database: z.string(), game: uuid, plan: z.string(), journal: z.string(), receipt: z.string(), request: uuid, stoppedApplication: z.literal(true) }).strict();
export type Options = z.infer<typeof optionsSchema>;
type Mode = 'plan' | 'apply' | 'reconcile';
export type Hooks = {
  fileStage?: FileHook;
  beforeDelete?: (tx: Prisma.TransactionClient) => void | Promise<void>;
  afterHistoryDelete?: (tx: Prisma.TransactionClient) => void | Promise<void>;
  afterRootDelete?: (tx: Prisma.TransactionClient) => void | Promise<void>;
  beforeCommit?: (tx: Prisma.TransactionClient) => void | Promise<void>;
  afterCommit?: () => void | Promise<void>;
};

export function operatorTarget(raw: string | undefined, env: Partial<NodeJS.ProcessEnv> = process.env) {
  try {
    if (!raw) throw new Error();
    const url = new URL(raw);
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.search || url.hash || url.password) throw new Error();
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(database) || ['postgres','template0','template1'].includes(database) || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(decodeURIComponent(url.username))) throw new Error();
    const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname.replace(/[\[\]]/g, '');
    const port = Number(url.port || 5432);
    url.hostname = host === '::1' ? '[::1]' : host;
    url.port = String(port); url.password = env.GAME_DATA_PASSWORD ?? '';
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('connect_timeout', '5');
    url.searchParams.set('sslmode', 'disable');
    return { url: url.href, host, port, database };
  } catch { throw new Error('Explicit local operator target refused'); }
}
export function parseArguments(args: string[]): { mode: Mode; options: Options } | { mode: 'restore-check'; options: RestoreOptions } {
  const [mode, ...rest] = args;
  if (!['plan','apply','reconcile','restore-check'].includes(mode)) throw new Error('Use plan, apply, reconcile or restore-check');
  const values: Record<string, unknown> = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    const name = key === '--stopped-application' ? 'stoppedApplication' : key === '--unserved-staging' ? 'unservedStaging' : key.slice(2);
    const allowed = mode === 'restore-check' ? ['--database','--evidence','--unserved-staging'] : ['--database','--game','--plan','--journal','--receipt','--request','--stopped-application'];
    if (!allowed.includes(key) || name in values) throw new Error('Ambiguous operator arguments');
    if (key === '--stopped-application' || key === '--unserved-staging') values[name] = true;
    else {
      const value = rest[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing operator argument');
      values[name] = value;
    }
  }
  if (mode === 'restore-check') {
    const parsed = restoreOptionsSchema.safeParse(values);
    if (!parsed.success) throw new Error('Explicit staging and independent evidence required');
    return { mode, options: parsed.data };
  }
  const parsed = optionsSchema.safeParse(values);
  if (!parsed.success) throw new Error('Complete explicit selection and stopped-application attestation required');
  return { mode: mode as Mode, options: parsed.data };
}

export async function restoreCheck(raw: RestoreOptions) {
  let client: PrismaClient | undefined;
  try {
    const options = restoreOptionsSchema.parse(raw);
    const target = operatorTarget(options.database);
    const custody = custodySchema.parse(readPrivate(options.evidence));
    const requests = new Set<string>(); const files = new Set<string>([options.evidence]);
    const evidence = custody.entries.map(entry => {
      for (const file of [entry.journal, ...(entry.receipt ? [entry.receipt] : [])]) {
        if (files.has(file)) throw new Error('Duplicate custody input'); files.add(file);
      }
      const intent = intentSchema.parse(readPrivate(entry.journal));
      validateCounts(intent.plan); same(intent.planDigest, digest(intent.plan));
      if (requests.has(intent.plan.request)) throw new Error('Duplicate request'); requests.add(intent.plan.request);
      if (entry.receipt) {
        const receipt = receiptSchema.parse(readPrivate(entry.receipt));
        same(receipt.intent, intent); same(receipt.intentDigest, digest(intent));
        if (receipt.firstFailure) same(receipt.firstFailure.intentDigest, digest(intent));
      }
      return { game: intent.plan.game, createdAt: intent.plan.createdAt, request: intent.plan.request, state: entry.receipt ? 'committed' : 'pending-or-uncertain' };
    });
    client = new PrismaClient({ datasourceUrl: target.url, log: [], errorFormat: 'minimal' });
    return await client.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '15000'`;
      await quiescent(tx);
      const binding = await databaseIdentity(tx, target);
      const conflicts: { game: string; createdAt: string; request: string; kind: string }[] = [];
      let conflictCount = 0;
      const ids = [...new Set(evidence.map(item => item.game))];
      const roots = ids.length ? await tx.gameSession.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } }) : [];
      const rootsById = new Map(roots.map(root => [root.id, root]));
      for (const item of evidence) {
        const root = rootsById.get(item.game);
        if (!root) continue;
        conflictCount++;
        if (conflicts.length < 100) conflicts.push({ game: item.game, createdAt: root.createdAt.toISOString(), request: item.request,
          kind: root.createdAt.toISOString() !== item.createdAt ? 'immutable-identity-mismatch' : item.state });
      }
      const uncertainCount = evidence.filter(e => e.state === 'pending-or-uncertain').length;
      return { outcome: conflictCount || uncertainCount ? 'blocked' : 'clear', target: binding, evidenceCount: evidence.length,
        conflictCount, uncertainCount, conflicts, truncated: conflictCount > conflicts.length, scope: 'supplied-independent-evidence-only' };
    }, { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 30000 });
  } catch {
    return { outcome: 'blocked', reason: 'custody-or-staging-check-incomplete', scope: 'supplied-independent-evidence-only' };
  } finally { await client?.$disconnect(); }
}

async function quiescent(tx: Prisma.TransactionClient) {
  const [visibility] = await tx.$queryRaw<{ visible: boolean }[]>`
    SELECT (r.rolsuper OR pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER')) AS visible FROM pg_roles r WHERE r.rolname=current_user`;
  if (!visibility?.visible) throw new Error('Session visibility required');
  await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
  const [sessions] = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM pg_stat_activity WHERE datid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND pid<>pg_backend_pid()`;
  if (sessions.count !== BigInt(0)) throw new Error('Database is not offline');
}
async function databaseIdentity(tx: Prisma.TransactionClient, target: ReturnType<typeof operatorTarget>) {
  const [row] = await tx.$queryRaw<{ host: string; port: number; database: string; oid: string; cluster: string }[]>`
    SELECT host(inet_server_addr()) AS host, inet_server_port() AS port, current_database() AS database,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
      (SELECT system_identifier::text FROM pg_control_system()) AS cluster`;
  if (!row || row.host !== target.host || row.port !== target.port || row.database !== target.database) throw new Error('Resolved target mismatch');
  return targetSchema.parse(row);
}
function validateCounts(plan: Plan) {
  const expected = tables.filter(t => !['_prisma_migrations','rate_limit_buckets','game_retirements'].includes(t));
  if (canonical(Object.keys(plan.counts).sort()) !== canonical(expected) || plan.counts.game_sessions !== 1) throw new Error('Invalid counted ownership');
}
function same(a: unknown, b: unknown) { if (canonical(a) !== canonical(b)) throw new Error('Exact selection changed'); }
function failureFile(options: Options) { return options.journal + '.failure.json'; }
function earlierFailure(options: Options, intentDigest: string): Failure | null {
  const file = failureFile(options);
  privatePath(file);
  if (!fs.existsSync(file)) return null;
  const failure = failureSchema.parse(readPrivate(file));
  same(failure.intentDigest, intentDigest);
  return failure;
}
export class LifecycleFailure extends Error {
  constructor(readonly report: { outcome: 'failed'; state: Failure['state']; stage: string; firstFailure: Failure | null }) {
    super('Offline lifecycle failed; keep service stopped and reconcile the exact private intent');
  }
}

// Hooks are dependency seams for real-stage fault tests, never CLI switches.
// No application initialization, dotenv loader, or reset/drop helper is imported.
export async function execute(mode: Mode, rawOptions: Options, hooks: Hooks = {}) {
  let stage: Failure['stage'] = 'input'; let state: Failure['state'] = 'not-deleted';
  let intent: Intent | undefined; let intentDigest: string | undefined;
  let client: PrismaClient | undefined; let options: Options | undefined;
  try {
    options = optionsSchema.parse(rawOptions);
    if (!['plan','apply','reconcile'].includes(mode)) throw new Error('Unsupported mode');
    const target = operatorTarget(options.database);
    for (const file of [options.plan, options.journal, options.receipt, failureFile(options)]) privatePath(file);
    if (new Set([options.plan, options.journal, options.receipt, failureFile(options)]).size !== 4) throw new Error('Distinct evidence paths required');
    const custody = digest({ plan: options.plan, journal: options.journal, receipt: options.receipt });
    const identity = identities();
    let input: Plan | undefined;
    if (mode !== 'plan') {
      input = planSchema.parse(readPrivate(options.plan)); validateCounts(input);
      same([input.request, input.game, input.custody], [options.request, options.game, custody]);
      same([input.policy,input.tool,input.source,input.sourceSchema], [identity.policy,identity.tool,identity.source,identity.sourceSchema]);
    } else if ([options.plan,options.journal,options.receipt,failureFile(options)].some(f => fs.existsSync(f))) throw new Error('Evidence collision');
    const o = options;
    client = new PrismaClient({ datasourceUrl: target.url, log: [], errorFormat: 'minimal' });
    stage = 'preflight';
    const result = await client.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '15000'`;
      await tx.$executeRaw`SET LOCAL lock_timeout = '1000'`;
      await quiescent(tx);
      const binding = await databaseIdentity(tx, target);
      // Session lease survives COMMIT and fences receipt finalization too. The
      // one-connection client releases it only on disconnect, including errors.
      const [lease] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_lock(hashtextextended(${canonical(binding)}, 0)) AS acquired`;
      if (!lease.acquired) throw new Error('Target already leased');
      stage = 'schema';
      const schema = await checkSchema(tx, identity);
      for (const table of tables) await tx.$executeRaw(Prisma.sql`LOCK TABLE ${tableSQL(table)} IN SHARE ROW EXCLUSIVE MODE NOWAIT`);
      same(await checkSchema(tx, identity), schema);
      if (input) same([input.target,input.schema], [binding,schema]);
      stage = 'selection';
      await tx.$queryRaw`SELECT id FROM public.game_sessions WHERE id=${o.game} FOR UPDATE NOWAIT`;
      const anchor = await tx.gameRetirement.findFirst({ where: { OR: [{ gameId: o.game }, { requestId: o.request }] } });
      const journalExists = fs.existsSync(o.journal);
      if (!journalExists && fs.existsSync(failureFile(o))) throw new Error('Failure evidence without intent');
      if (mode === 'reconcile' || journalExists || anchor) {
        if (!input || !journalExists) throw new Error('Missing pending evidence');
        intent = intentSchema.parse(readPrivate(o.journal));
        same(intent.plan, input); same(intent.planDigest, digest(input));
        intentDigest = digest(intent);
        earlierFailure(o, intentDigest);
        syncPrivate(o.journal);
        if (anchor) {
          same([anchor.gameId,anchor.requestId,anchor.planDigest,anchor.intentDigest,anchor.evidence], [o.game,o.request,digest(input),intentDigest,intent]);
          const graph = await readGraph(tx);
          const current = selection(graph, o.game);
          if (Object.values(current.counts).some(n => n !== 0)) throw new Error('Anchor with resurrected game data');
          state = 'committed';
          await quiescent(tx);
          return { outcome: 'reconciled', game: o.game, request: o.request };
        }
      }
      const graph = await readGraph(tx);
      const selected = selection(graph, o.game);
      const root = selected.owned.game_sessions[0]?.row;
      if (!root) { state = 'uncertain'; throw new Error('Absent game without anchor'); }
      if (root.status !== 'ENDED' || typeof root.archivedAt !== 'string') throw new Error('Archived ended root required');
      // PostgreSQL to_jsonb(timestamp without time zone) has no UTC suffix.
      // Use Prisma's typed dates, not host-local Date parsing of graph JSON.
      const dates = await tx.gameSession.findUniqueOrThrow({ where: { id: o.game }, select: { createdAt: true, archivedAt: true } });
      const plan: Plan = planSchema.parse({ format: 'game-cleanup-plan/1', request: o.request, custody, target: binding, game: o.game,
        createdAt: dates.createdAt.toISOString(), archivedAt: dates.archivedAt!.toISOString(), status: root.status,
        version: root.version, sequence: root.eventSequence, policy: identity.policy, tool: identity.tool, source: identity.source,
        sourceSchema: identity.sourceSchema, schema, data: selected.data, other: selected.other, counts: selected.counts });
      validateCounts(plan);
      if (mode === 'plan') {
        stage = 'plan-file'; writePrivate(o.plan, plan);
        return { outcome: 'planned', game: o.game, request: o.request };
      }
      same(input, plan);
      if (fs.existsSync(o.receipt)) throw new Error('Receipt without anchor');
      stage = 'pending';
      if (!intent) {
        intent = { format: 'game-retirement-intent/1', plan, planDigest: digest(plan), initiatorTag: randomUUID(), startedAt: new Date().toISOString() };
        intentDigest = digest(intent);
        pending(o.journal, intent, hooks.fileStage);
      }
      same(readPrivate(o.journal), intent);
      await quiescent(tx);
      stage = 'delete';
      await hooks.beforeDelete?.(tx);
      state = 'rolled-back';
      for (const table of ['domain_events','command_receipts','checkpoints','presence']) await tx.$executeRaw(Prisma.sql`DELETE FROM ${tableSQL(table)} WHERE "gameId"=${o.game}`);
      await hooks.afterHistoryDelete?.(tx);
      await tx.$executeRaw`DELETE FROM public.game_sessions WHERE id=${o.game}`;
      await hooks.afterRootDelete?.(tx);
      stage = 'zero-residue';
      await zeroResidue(tx, o.game, selected);
      stage = 'anchor';
      await tx.gameRetirement.create({ data: { gameId: o.game, requestId: o.request, planDigest: digest(plan), intentDigest: intentDigest!, evidence: intent as unknown as Prisma.InputJsonValue, retiredAt: new Date() } });
      await quiescent(tx);
      await hooks.beforeCommit?.(tx);
      stage = 'commit'; state = 'uncertain';
      return { outcome: 'purged', game: o.game, request: o.request };
    }, { maxWait: 2000, timeout: 30000 });
    if (mode === 'plan') return result;
    stage = 'commit-observation';
    await hooks.afterCommit?.();
    state = 'committed';
    stage = 'finalize';
    const anchor = await client.gameRetirement.findUniqueOrThrow({ where: { gameId: o.game } });
    const receipt = { format: 'game-retirement-receipt/1', intent: intent!, intentDigest: intentDigest!, retiredAt: anchor.retiredAt.toISOString(),
      firstFailure: earlierFailure(o, intentDigest!), earlierAttempt: 'pending-or-incomplete', scope: 'selected-database-only' };
    finalize(o.receipt, receipt, intentDigest!, hooks.fileStage);
    return result;
  } catch {
    let firstFailure: Failure | null = null;
    if (options && intent && intentDigest) {
      try {
        same(readPrivate(options.journal), intent);
        firstFailure = earlierFailure(options, intentDigest);
        if (!firstFailure) {
          firstFailure = { format: 'game-retirement-failure/1', intentDigest, stage, state, at: new Date().toISOString() };
          writePrivate(failureFile(options), firstFailure);
        }
      } catch { /* Original failure still wins; pending evidence remains uncertain. */ }
    }
    throw new LifecycleFailure({ outcome: 'failed', stage, state, firstFailure });
  } finally { await client?.$disconnect(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const parsed = parseArguments(process.argv.slice(2));
    const report = parsed.mode === 'restore-check' ? await restoreCheck(parsed.options) : await execute(parsed.mode, parsed.options);
    console.log(JSON.stringify(report));
    if (report.outcome === 'blocked') process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify(error instanceof LifecycleFailure ? error.report : { outcome: 'failed', state: 'not-deleted', stage: 'arguments' }));
    process.exitCode = 1;
  }
}
