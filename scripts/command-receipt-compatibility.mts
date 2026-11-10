import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { assertLease, resolveTarget, resetDatabase } from './test-database.mjs';

export const A_REVISION = 'c2e00f2a9fb505b1f159476447acd880b7216dc2';
const operations = ['addPlayer', 'createCheckpoint', 'scanQr'] as const;
const lanes = ['A_PRE_MIGRATION_STATUS', 'A_B_STATUS', 'A_B_POST_REFUSED', 'B_B_STATUS', 'B_B_DUPLICATE', 'B_A_STATUS', 'B_A_DUPLICATE'] as const;
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
type SourceEntry = { path: string; sha256: string };
type Prepared = { revision: string; sourceId: string; entries: SourceEntry[] };
type EffectCounts = { players: number; scans: number; events: number; receipts: number; version: number };
type Observation = { id: string; operation: string; passed: boolean; beforeHash: string; afterHash: string; beforeEffects: EffectCounts; afterEffects: EffectCounts };
type Specimen = { gameId: string; playerId: string; commands: { operation: string; commandId: string; expectedVersion: number; result: unknown }[] };

function git(root: string, args: string[]): Buffer {
  const result = spawnSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Pinned compatibility source object unavailable');
  return result.stdout;
}
function allowlisted(name: string) {
  return ['package.json', 'package-lock.json', 'tsconfig.json', 'prisma/schema.prisma', 'prisma/migrations/migration_lock.toml', 'vitest.config.mts', 'playwright.config.ts', 'playwright.security.config.ts', 'playwright.recovery.config.ts'].includes(name) ||
    /^(src|tests)\/[A-Za-z0-9_./\[\]-]+\.(ts|tsx|json)$/.test(name) ||
    /^scripts\/[A-Za-z0-9_.-]+\.(mts|sh)$/.test(name) || /^prisma\/migrations\/[A-Za-z0-9_-]+\/migration\.sql$/.test(name);
}
/** Materialize actual Git objects before the history-free B capsule is entered. */
export function prepareCompatibilitySource(root: string, output: string, revision = A_REVISION): Prepared {
  if (revision !== A_REVISION) throw new Error('Unknown compatibility producer revision');
  if (git(root, ['rev-parse', `${revision}^{commit}`]).toString().trim() !== A_REVISION) throw new Error('Compatibility producer revision mismatch');
  if (fs.existsSync(output)) throw new Error('Compatibility source output must be new');
  const tree = git(root, ['ls-tree', '-r', '-z', revision]).toString().split('\0').filter(Boolean);
  const entries: SourceEntry[] = [];
  for (const line of tree) {
    const [metadata, name] = line.split('\t');
    if (!allowlisted(name)) continue;
    if (!/^100(644|755) blob [a-f0-9]+$/.test(metadata)) throw new Error('Unsupported compatibility source entry');
    const bytes = git(root, ['show', `${revision}:${name}`]);
    const destination = path.join(output, 'source', name);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.writeFileSync(destination, bytes);
    entries.push({ path: name, sha256: hash(bytes) });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = { revision, sourceId: hash(JSON.stringify(entries)), entries };
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
export function verifyPreparedSource(output: string): Prepared {
  const manifest: Prepared = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  if (manifest.revision !== A_REVISION || !manifest.entries.length || hash(JSON.stringify(manifest.entries)) !== manifest.sourceId ||
      !['prisma/schema.prisma', 'src/lib/command.ts', 'src/modules/recovery/recovery.service.ts', 'src/modules/game-session/game-session.service.ts', 'src/modules/scenario/scenario.service.ts'].every(name => manifest.entries.some(e => e.path === name))) throw new Error('Compatibility source identity mismatch');
  for (const entry of manifest.entries) {
    if (!allowlisted(entry.path) || hash(fs.readFileSync(path.join(output, 'source', entry.path))) !== entry.sha256) throw new Error('Compatibility source identity mismatch');
  }
  return manifest;
}

export function readCompatibilityReport(file: string, sourceId: string) {
  const report = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    complete: boolean; producerA: Prepared; producerB: { sourceId: string; entries: SourceEntry[] };
    observations: Observation[]; migrations: string[]; limitations: string[];
    originalIdentityFloor: { unit: { original: number; retained: number; missing: string[] }; ordinary: { original: number; retained: number; missing: string[] }; security: { original: number; retained: number; missing: string[] }; physical: { original: number; retained: number; missing: string[] } };
  };
  const expected = operations.flatMap(operation => lanes.map(lane => `${lane}:${operation}`)).sort();
  if (!report.complete || report.producerA?.revision !== A_REVISION || !/^[a-f0-9]{64}$/.test(report.producerA.sourceId) ||
      report.producerA.sourceId !== hash(JSON.stringify(report.producerA.entries)) || report.producerB?.sourceId !== sourceId ||
      !report.producerB.entries?.length || !report.migrations?.includes('20261109110000_command_receipt_metadata') ||
      !report.limitations?.includes('NOT_SAFE_OPERATIONAL_ROLLBACK') ||
      !Array.isArray(report.observations) || JSON.stringify(report.observations.map(o => `${o.id}:${o.operation}`).sort()) !== JSON.stringify(expected) ||
      report.observations.some(o => !o.passed || !/^[a-f0-9]{64}$/.test(o.beforeHash) || o.beforeHash !== o.afterHash ||
        !o.beforeEffects || !['players', 'scans', 'events', 'receipts', 'version'].every(key => Number.isSafeInteger(o.beforeEffects[key as keyof EffectCounts]) && o.beforeEffects[key as keyof EffectCounts] >= 0) ||
        !isDeepStrictEqual(o.beforeEffects, o.afterEffects))) throw new Error('Incomplete or mismatching compatibility report');
  for (const [kind, count] of Object.entries({ unit: 292, ordinary: 38, security: 18, physical: 1 })) {
    const floor = report.originalIdentityFloor?.[kind as keyof typeof report.originalIdentityFloor];
    if (!floor || floor.original !== count || floor.retained !== count || floor.missing.length) throw new Error('Original release identity floor not preserved');
  }
  return report;
}

type BrowserTree = { suites?: BrowserTree[]; specs?: { file: string; title: string; tests: { projectName: string }[] }[] };
function browserIdentities(tree: BrowserTree): string[] {
  return [...(tree.specs ?? []).flatMap(s => s.tests.map(t => `${path.basename(s.file)}:${s.title}:${t.projectName}`)), ...(tree.suites ?? []).flatMap(browserIdentities)];
}
function preserved(original: string[], current: string[]) {
  const remaining = [...current]; const missing: string[] = [];
  for (const id of original) {
    const at = remaining.indexOf(id);
    if (at < 0) missing.push(id); else remaining.splice(at, 1);
  }
  return { original: original.length, retained: original.length - missing.length, missing };
}

async function worker(mode: string, file: string, producer: 'A' | 'B', observationsFile?: string) {
  const target = resolveTarget(); assertLease(target);
  // Dynamic imports resolve in the selected producer's cwd/tsconfig and use its
  // separately generated Prisma client. No active workspace client is touched.
  const load = (name: string) => import(pathToFileURL(path.join(process.cwd(), name)).href);
  const { prisma } = await load('src/lib/db.ts');
  const session = await load('src/modules/game-session/game-session.service.ts');
  const recovery = await load('src/modules/recovery/recovery.service.ts');
  const scenario = await load('src/modules/scenario/scenario.service.ts');
  const fingerprint = async (gameId: string) => {
    const rows: { game: { version: number }; players: number; scans: number; events: number; receipts: unknown[] | null }[] = await prisma.$queryRaw`
    SELECT (SELECT row_to_json(g) FROM game_sessions g WHERE id = ${gameId}) AS game,
      (SELECT count(*)::int FROM players WHERE "gameId" = ${gameId}) AS players,
      (SELECT count(*)::int FROM qr_scans WHERE "gameId" = ${gameId}) AS scans,
      (SELECT count(*)::int FROM domain_events WHERE "gameId" = ${gameId}) AS events,
      (SELECT json_agg(r ORDER BY "commandId") FROM command_receipts r WHERE "gameId" = ${gameId}) AS receipts`;
    const row = rows[0];
    return { hash: hash(JSON.stringify(rows)), effects: { players: row.players, scans: row.scans, events: row.events,
      receipts: row.receipts?.length ?? 0, version: row.game.version } };
  };
  try {
    if (mode === 'produce') {
      const { gameId } = await session.createGame(`Synthetic compatibility producer ${producer}`);
      const addId = randomUUID(), checkpointId = randomUUID(), scanId = randomUUID();
      const added = await session.addPlayer({ gameId, commandId: addId, expectedVersion: 1, displayName: 'Synthetic Ada' });
      const checkpoint = await recovery.createCheckpoint({ gameId, commandId: checkpointId, expectedVersion: added.version, reason: 'SYNTHETIC_COMPATIBILITY' });
      await prisma.gameSession.update({ where: { id: gameId }, data: { status: 'ACTIVE', phase: 'INVESTIGATION', cycleNumber: 1 } });
      const scan = await scenario.scanQr({ gameId, playerId: added.playerId, commandId: scanId, expectedVersion: checkpoint.version, token: 'tsf-qr-letter-001' });
      if (!scan.outcome.discoveries.includes('clue-letter') || !scan.outcome.tasks.includes('task-examine-letter')) throw new Error('Meaningful committed scan required');
      const specimen: Specimen = { gameId, playerId: added.playerId, commands: [
        { operation: 'addPlayer', commandId: addId, expectedVersion: 1, result: { playerId: added.playerId } },
        { operation: 'createCheckpoint', commandId: checkpointId, expectedVersion: added.version, result: { checkpointId: checkpoint.checkpointId } },
        { operation: 'scanQr', commandId: scanId, expectedVersion: checkpoint.version, result: { outcome: scan.outcome } },
      ] };
      fs.writeFileSync(file, JSON.stringify(specimen, null, 2));
      // Synthetic committed durable rows only; never session/claim credentials,
      // snapshots or dumps. Attribution lives beside these generated specimens.
      const rows = await prisma.$queryRaw`SELECT "commandId", "resultingVersion", status, "resultJson",
        to_jsonb(r)->'operation' AS operation, to_jsonb(r)->'actor' AS actor,
        to_jsonb(r)->'resultVersion' AS "resultVersion", (to_jsonb(r)->>'requestHash' IS NOT NULL) AS "identityComplete"
        FROM command_receipts r WHERE "gameId" = ${gameId} ORDER BY "resultingVersion"`;
      const events = await prisma.domainEvent.findMany({ where: { gameId, commandId: { in: specimen.commands.map(c => c.commandId) } }, select: { commandId: true, actor: true, gameVersion: true, eventType: true, payload: true } });
      if (producer === 'A' ? rows.some((r: { operation: unknown }) => r.operation !== null) : rows.some((r: { operation: unknown }) => r.operation === null)) throw new Error('Unexpected writer metadata');
      fs.writeFileSync(file.replace(/\.json$/, '-rows.json'), JSON.stringify({ producer, rows, events }, null, 2));
      return;
    }
    const specimen: Specimen = JSON.parse(fs.readFileSync(file, 'utf8'));
    const observations: Observation[] = [];
    for (const command of specimen.commands) {
      const before = await fingerprint(specimen.gameId);
      if (mode.endsWith('STATUS')) {
        const status = producer === 'A'
          ? await recovery.getCommandStatus(specimen.gameId, command.commandId)
          : await recovery.getCommandStatus(specimen.gameId, command.commandId, { kind: 'storyteller' });
        if (status.status !== 'APPLIED' || !isDeepStrictEqual(status.result, command.result) || status.resultingGameVersion !== command.expectedVersion + 1) throw new Error('Committed result shape incompatible');
        if (producer === 'B' && command.operation === 'scanQr') {
          const own = await recovery.getCommandStatus(specimen.gameId, command.commandId, { kind: 'player', playerId: specimen.playerId });
          const denied = await recovery.getCommandStatus(specimen.gameId, command.commandId, { kind: 'player', playerId: 'other-synthetic-player' });
          if (own.status !== 'APPLIED' || denied.status !== 'UNKNOWN') throw new Error('Legacy/current ownership mismatch');
        }
      } else {
        const base = { gameId: specimen.gameId, commandId: command.commandId, expectedVersion: command.expectedVersion };
        let refused = false;
        try {
          const result = command.operation === 'addPlayer' ? await session.addPlayer({ ...base, displayName: 'Synthetic Ada' })
            : command.operation === 'createCheckpoint' ? await recovery.createCheckpoint({ ...base, reason: 'SYNTHETIC_COMPATIBILITY' })
            : await scenario.scanQr({ ...base, playerId: specimen.playerId, token: 'tsf-qr-letter-001' });
          if (mode === 'A_B_POST_REFUSED') throw new Error('Historical POST unexpectedly accepted');
          const { version, ...fields } = result;
          if (version !== command.expectedVersion + 1 || !isDeepStrictEqual(fields, command.result)) throw new Error('Duplicate result shape incompatible');
        } catch (error) {
          if (mode !== 'A_B_POST_REFUSED' || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'COMMAND_RECEIPT_INVALID') throw error;
          refused = true;
        }
        if (mode === 'A_B_POST_REFUSED' && !refused) throw new Error('Historical POST refusal missing');
      }
      const after = await fingerprint(specimen.gameId);
      if (before.hash !== after.hash || !isDeepStrictEqual(before.effects, after.effects)) throw new Error('Reader repeated or changed authoritative effects');
      observations.push({ id: mode, operation: command.operation, passed: true, beforeHash: before.hash, afterHash: after.hash,
        beforeEffects: before.effects, afterEffects: after.effects });
    }
    fs.writeFileSync(observationsFile!, JSON.stringify(observations, null, 2));
  } finally { await prisma.$disconnect(); }
}

export function runCompatibility(root: string, prepared: string, output: string, sourceId: string) {
  const target = resolveTarget(); assertLease(target);
  if (!/^[a-f0-9]{64}$/.test(sourceId)) throw new Error('Exact B source identity required');
  const producerA = verifyPreparedSource(prepared);
  if (fs.existsSync(output)) throw new Error('Use a new compatibility evidence directory');
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(output, 'compatibility.json'), JSON.stringify({ schema: 1, complete: false,
    producerA, producerB: { sourceId }, reason: 'Compatibility observations have not completed; inspect retained stage logs' }, null, 2));
  const a = path.join(prepared, 'source');
  const script = fileURLToPath(import.meta.url);
  const execute = (cwd: string, executable: string, args: string[], name: string, env: Partial<NodeJS.ProcessEnv> = {}) => {
    const fd = fs.openSync(path.join(output, `${name}.log`), 'wx', 0o600);
    try {
      const result = spawnSync(executable, args, { cwd, env: { ...target.env, ...env }, stdio: ['ignore', fd, fd] });
      if (result.status !== 0) throw new Error(`Compatibility stage failed: ${name}; evidence retained`);
    } finally { fs.closeSync(fd); }
  };
  const lane = (cwd: string, mode: string, specimen: string, producer: 'A' | 'B') => execute(cwd,
    path.join(cwd, 'node_modules/.bin/tsx'), [script, 'worker', mode, specimen, producer, path.join(output, `${mode}.json`)], mode);
  execute(a, 'npm', ['ci', '--no-audit', '--no-fund'], 'install-A');
  execute(a, 'npm', ['run', 'db:generate'], 'generate-A');
  const inventories: Record<string, string[]> = {};
  for (const [label, cwd] of [['A', a], ['B', root]]) {
    const unitFile = path.join(output, `${label}-unit-discovery.json`);
    execute(cwd, path.join(cwd, 'node_modules/.bin/vitest'), ['list', '--staticParse=false', `--json=${unitFile}`], `${label}-unit-discovery`);
    inventories[`${label}-unit`] = (JSON.parse(fs.readFileSync(unitFile, 'utf8')) as { file: string; name: string }[]).map(t => `${t.file.replace(/^.*\/(src|tests)\//, '$1/')}:${t.name}`);
    for (const [kind, config] of [['ordinary', 'playwright.config.ts'], ['security', 'playwright.security.config.ts'], ['physical', 'playwright.recovery.config.ts']]) {
      const file = path.join(output, `${label}-${kind}-discovery.json`);
      execute(cwd, path.join(cwd, 'node_modules/.bin/playwright'), ['test', `--config=${config}`, '--list', '--reporter=json'], `${label}-${kind}-discovery`, { PLAYWRIGHT_JSON_OUTPUT_FILE: file });
      inventories[`${label}-${kind}`] = browserIdentities(JSON.parse(fs.readFileSync(file, 'utf8')));
    }
  }
  const originalIdentityFloor = Object.fromEntries(['unit', 'ordinary', 'security', 'physical'].map(kind => [kind, preserved(inventories[`A-${kind}`], inventories[`B-${kind}`])]));
  // One inherited live lease; reset only this owned disposable target, never
  // acquire again or reset beneath a running browser server.
  resetDatabase(target, process.env.BASELINE_DB_LEASE, a);
  const beforeMigration = path.join(output, 'A-before-migration-specimen.json');
  execute(a, path.join(a, 'node_modules/.bin/tsx'), [script, 'worker', 'produce', beforeMigration, 'A'], 'produce-before-migration');
  execute(root, path.join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], 'additive-migration');
  const aSpecimen = path.join(output, 'A-specimen.json'), bSpecimen = path.join(output, 'B-specimen.json');
  lane(a, 'produce', aSpecimen, 'A');
  execute(root, path.join(root, 'node_modules/.bin/tsx'), [script, 'worker', 'produce', bSpecimen, 'B'], 'produce-B');
  for (const mode of lanes) lane(mode.startsWith('B_A') ? a : root, mode, mode === 'A_PRE_MIGRATION_STATUS' ? beforeMigration : mode.startsWith('A_B') ? aSpecimen : bSpecimen, mode.startsWith('B_A') ? 'A' : 'B');
  const producerB = { sourceId, entries: ['src/lib/command.ts', 'src/lib/command-contracts.ts', 'src/modules/game-session/game-session.service.ts', 'src/modules/recovery/recovery.service.ts', 'src/modules/scenario/scenario.service.ts', 'prisma/schema.prisma'].map(name => ({ path: name, sha256: hash(fs.readFileSync(path.join(root, name))) })) };
  const observations = lanes.flatMap(mode => JSON.parse(fs.readFileSync(path.join(output, `${mode}.json`), 'utf8')) as Observation[]);
  const migration = spawnSync('psql', ['-Atc', 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name'], { env: target.env, encoding: 'utf8' });
  if (migration.status !== 0) throw new Error('Migration observation failed');
  verifyPreparedSource(prepared);
  const report = { schema: 1, complete: true, producerA, producerB, observations,
    originalIdentityFloor,
    migrations: migration.stdout.trim().split('\n'), limitations: ['NOT_SAFE_OPERATIONAL_ROLLBACK', 'A_IGNORES_IDENTITY_AND_CORRUPTION', 'A_RESET_CREDENTIAL_REPLAY_UNSUPPORTED', 'FUTURE_READERS_UNSUPPORTED'],
    specimens: ['A-before-migration-specimen-rows.json', 'A-specimen-rows.json', 'B-specimen-rows.json'], synthetic: true };
  fs.writeFileSync(path.join(output, 'compatibility.json'), JSON.stringify(report, null, 2));
  return readCompatibilityReport(path.join(output, 'compatibility.json'), sourceId);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'worker') await worker(process.argv[3], process.argv[4], process.argv[5] as 'A' | 'B', process.argv[6]);
  else if (process.argv[2] === 'run') runCompatibility(process.cwd(), process.argv[3], process.argv[4], process.argv[5]);
  else throw new Error('Use run with prepared pinned A source, output and exact B source identity');
}
