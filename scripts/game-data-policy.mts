import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
}
export const digest = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
export const bytesDigest = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
// Reviewed fresh PG16 catalog after all 14 admitted migrations, including the
// independent retirement anchor. Never learn this identity from an operator DB.
const admittedCatalog = '3d148430b8f8ec58f02d04fdc1d870aef225eac93e3c302ee58f17ed092d880f';
const admittedSourceSchema = '2f783ea1061f857e8e6144c08364345d197f3407c112bc53ace4c3e7af4868d9';
// AS5: aggregate limits include both games and global budgets, not only the
// selected graph. Exceeding either limit requires refusal, never a batched purge.
export const graphBudget = { rows: 100_000, bytes: 16 * 1024 * 1024 } as const;

// This is an admission policy, not a discovery-driven deletion list. New fields,
// models and relations require a reviewed policy change, even with fresh plans.
const inventory = [
  ['GameSession', 'game_sessions', 'id name status phase cycleNumber version eventSequence scriptId scriptVersion scenarioId scenarioVersion winner winReason archivedAt createdAt updatedAt'],
  ['Player', 'players', 'id gameId displayName virtualSeat participantKind alive ghostVoteAvailable createdAt updatedAt'],
  ['PlayerClaim', 'player_claims', 'id playerId tokenHash expiresAt claimedAt commandId revokedAt createdAt'],
  ['PlayerSecret', 'player_secrets', 'playerId trueCharacterId perceivedCharacterId trueAlignment abilityStateJson roleAcknowledgedAt createdAt updatedAt'],
  ['BrowserSession', 'browser_sessions', 'id playerId storytellerGameId sessionTokenHash createdAt expiresAt revokedAt'],
  ['DomainEvent', 'domain_events', 'id gameId sequence gameVersion eventType actor commandId payload createdAt'],
  ['CommandReceipt', 'command_receipts', 'id commandId gameId resultingVersion status resultJson operation actor resultVersion requestHash createdAt'],
  ['Checkpoint', 'checkpoints', 'id gameId gameVersion lastEventSequence snapshotJson checksum reason boundaryKey createdAt'],
  ['SetupDraft', 'setup_drafts', 'id gameId generatorVersion seed candidateJson regenerationIndex committedAt setupHash createdAt updatedAt'],
  ['OperationalPhase', 'operational_phases', 'id gameId cycleNumber status startedAt completedAt'],
  ['OperationalAction', 'operational_actions', 'id operationalPhaseId orderIndex kind actorPlayerId status publicJson secretJson resolutionJson createdAt updatedAt'],
  ['Effect', 'effects', 'id gameId effectType sourcePlayerId targetPlayerId cycleNumber expiryBoundary active metadataJson createdAt'],
  ['InvestigationState', 'investigation_states', 'gameId cycleNumber nominationState currentExecutionCandidatePlayerId currentHighEffectiveVotes executionOccurred startedAt completedAt'],
  ['Nomination', 'nominations', 'id gameId cycleNumber nominatorId nomineeId status sequence rawTotal effectiveTotal qualified decisionJson passStatus currentVirtualSeat createdAt'],
  ['Vote', 'votes', 'id nominationId playerId rawIntent valid effectiveWeight ghostVoteConsumed invalidReason lockedAt'],
  ['DeathRecord', 'death_records', 'id gameId playerId cycleNumber phase source causedByPlayerId executed createdAt'],
  ['ScenarioState', 'scenario_states', 'gameId scenarioId scenarioVersion stageId mapVersionId stateJson updatedAt'],
  ['QrScan', 'qr_scans', 'id gameId playerId qrTokenId commandId outcome createdAt'],
  ['ScenarioDiscovery', 'scenario_discoveries', 'id gameId playerId objectId objectType visibilityScope contentJson discoveredAt'],
  ['TaskState', 'task_states', 'id gameId taskId playerId state updatedAt'],
  ['ScenarioCondition', 'scenario_conditions', 'id gameId conditionId playerId active updatedAt'],
  ['Presence', 'presence', 'id gameId viewerId lastSeenAt'],
  ['RateLimitBucket', 'rate_limit_buckets', 'id key windowStart count'],
  ['GameRetirement', 'game_retirements', 'gameId requestId intentDigest planDigest evidence retiredAt'],
] as const;
export const families = inventory.slice(0, 22).map(([model, table]) => ({ model, table }));
export const tables = [...inventory.map(([, table]) => table), '_prisma_migrations'].sort();
export type Tx = Prisma.TransactionClient;
export const tableSQL = (table: string) => {
  if (!tables.includes(table as typeof tables[number])) throw new Error('Unclassified table');
  return Prisma.raw('public."' + table + '"');
};
function sourceFiles(dir: string): [string, string][] {
  return fs.readdirSync(path.join(root, dir)).sort().flatMap(name => {
    const relative = path.posix.join(dir, name); const file = path.join(root, relative);
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink()) throw new Error('Source custody refused');
    return st.isDirectory() ? sourceFiles(relative) : [[relative, bytesDigest(fs.readFileSync(file))]];
  });
}
export function identities() {
   const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
   // Includes relation attributes and native types: checking names alone would
   // let a stale generated client silently admit an unknown source shape.
   if (bytesDigest(schema) !== admittedSourceSchema) throw new Error('Unadmitted source schema');
  const migrations = sourceFiles('prisma/migrations').filter(([name]) => name.endsWith('/migration.sql'));
  const admittedMigrations = ['20260820113931_init','20260820114215_claim_command_id','20260820115707_harden_sessions','20260820133857_slice2_setup_operational','20260820143455_slice3_effects','20260820182427_slice4_investigation','20260820185337_slice5_scenario','20260820192850_slice6_checkpoints','20260821181635_remediation_nomination_trigger','20260821182909_remediation_vote_pass','20260821210000_r1_presence_checkpoint_boundary','20260821220000_r2_security_durability','20261109110000_command_receipt_metadata','20261113120000_game_retirement'];
  if (canonical(migrations.map(([name]) => name.split('/')[2])) !== canonical(admittedMigrations)) throw new Error('Unclassified source migration');
  const modelNames = [...schema.matchAll(/^model (\w+) \{/gm)].map(m => m[1]).sort();
  if (canonical(modelNames) !== canonical(inventory.map(([name]) => name).sort())) throw new Error('Unclassified source model');
  for (const [model, table, columns] of inventory) {
    const body = schema.match(new RegExp('model ' + model + ' \\{([\\s\\S]*?)\\n\\}'))?.[1];
    const generated = Prisma.dmmf.datamodel.models.find(m => m.name === model);
    if (!body?.includes('@@map("' + table + '")') || !generated || generated.dbName !== table) throw new Error('Model mapping drift');
    const scalar = generated.fields.filter(f => f.kind !== 'object');
    const sourceScalar = [...body.matchAll(/^\s+(\w+)\s+(\w+)(\??)(?:\s|$)/gm)].filter(m => !modelNames.includes(m[2])).map(m => m[1]).sort();
    if (canonical(scalar.map(f => f.name).sort()) !== canonical(columns.split(' ').sort()) || canonical(sourceScalar) !== canonical(columns.split(' ').sort())) throw new Error('Unclassified source column');
  }
  const tool = digest(['game-data-lifecycle.mts', 'game-data-policy.mts', 'game-data-journal.mts'].map(name => bytesDigest(fs.readFileSync(path.join(root, 'scripts', name)))));
   return { policy: digest({ inventory, admittedCatalog, admittedSourceSchema, graphBudget }), tool, source: digest(sourceFiles('src')), sourceSchema: bytesDigest(schema), migrations };
}

export async function checkSchema(tx: Tx, identity: ReturnType<typeof identities>) {
  const [server] = await tx.$queryRaw<{ version: number }[]>`SELECT current_setting('server_version_num')::int AS version`;
  if (server.version < 160000 || server.version >= 170000) throw new Error('Unadmitted PostgreSQL catalog version');
  const actual = await tx.$queryRaw<{ table: string; kind: string; schema: string; rls: boolean }[]>`
    SELECT c.relname AS "table", c.relkind::text AS kind, n.nspname AS schema, c.relrowsecurity AS rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname`;
  if (actual.some(t => t.schema !== 'public' || t.kind !== 'r' || t.rls) || canonical(actual.map(t => t.table).sort()) !== canonical(tables)) throw new Error('Unclassified database relation');
  const columns = await tx.$queryRaw<{ table: string; column: string; udt: string; nullable: string }[]>`
    SELECT table_name AS "table", column_name AS "column", udt_name AS udt, is_nullable AS nullable
    FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, column_name`;
  for (const [model, table, fields] of inventory) {
    const found = columns.filter(c => c.table === table);
    if (canonical(found.map(c => c.column).sort()) !== canonical(fields.split(' ').sort())) throw new Error('Database column drift');
    for (const col of found) {
      const field = Prisma.dmmf.datamodel.models.find(m => m.name === model)!.fields.find(f => f.name === col.column)!;
      const type = ({ String: 'text', Int: 'int4', Boolean: 'bool', DateTime: 'timestamp', Json: 'jsonb' } as Record<string, string>)[field.type] ?? field.type;
      if (col.udt !== type || col.nullable !== (field.isRequired ? 'NO' : 'YES') || field.dbName) throw new Error('Database field mapping drift');
    }
  }
  const fks = await tx.$queryRaw<{ child: string; parent: string; column: string; referenced: string; deletion: string; update: string; validated: boolean; deferred: boolean }[]>`
    SELECT c.relname AS child, p.relname AS parent, a.attname AS "column", b.attname AS referenced,
      k.confdeltype::text AS deletion, k.confupdtype::text AS update, k.convalidated AS validated, k.condeferrable AS deferred
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_class p ON p.oid=k.confrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(k.conkey)
      JOIN pg_attribute b ON b.attrelid=p.oid AND b.attnum=ANY(k.confkey)
    WHERE k.contype='f' AND n.nspname='public'`;
  const direct = families.filter(f => !['game_sessions','player_claims','player_secrets','browser_sessions','operational_actions','votes','presence'].includes(f.table));
  const expected = [
    ...direct.map(f => ({ child: f.table, parent: 'game_sessions', column: 'gameId', deletion: ['domain_events','command_receipts','checkpoints'].includes(f.table) ? 'r' : 'c' })),
    ...['player_claims','player_secrets','browser_sessions'].map(child => ({ child, parent: 'players', column: 'playerId', deletion: 'c' })),
    { child: 'browser_sessions', parent: 'game_sessions', column: 'storytellerGameId', deletion: 'c' },
    { child: 'operational_actions', parent: 'operational_phases', column: 'operationalPhaseId', deletion: 'c' },
    { child: 'votes', parent: 'nominations', column: 'nominationId', deletion: 'c' },
  ].map(f => ({ ...f, referenced: 'id', update: 'c', validated: true, deferred: false }));
  const sorted = (v: unknown[]) => v.map(canonical).sort();
  if (canonical(sorted(fks)) !== canonical(sorted(expected))) throw new Error('Foreign key ownership drift');
  const migrations = await tx.$queryRaw<{ name: string; checksum: string; finished: boolean }[]>`
    SELECT migration_name AS name, checksum, (finished_at IS NOT NULL AND rolled_back_at IS NULL AND applied_steps_count=1) AS finished FROM public._prisma_migrations ORDER BY migration_name`;
  if (canonical(migrations) !== canonical(identity.migrations.map(([name, checksum]) => ({ name: name.split('/')[2], checksum, finished: true })))) throw new Error('Migration mapping drift');
  const triggers = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal`;
  if (triggers[0].n !== BigInt(0)) throw new Error('Unclassified database trigger');
   const catalog = await schemaCatalog(tx);
   if (digest(catalog) !== admittedCatalog) throw new Error('Unadmitted database catalog');
  return digest({ catalog, migrations, source: identity.sourceSchema });
}

// Checked in against the additive migration on a fresh PG16 synthetic cluster;
// schema evolution needs an explicit policy review, not discovery-driven consent.
export async function schemaCatalog(tx: Tx) {
  const catalog = await tx.$queryRaw<{ data: string }[]>`
    SELECT jsonb_build_object('table', c.relname, 'name', k.conname, 'definition', pg_get_constraintdef(k.oid))::text AS data
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT jsonb_build_object('index', indexname, 'definition', indexdef)::text FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT jsonb_build_object('table', table_name, 'column', column_name, 'type', udt_name, 'default', column_default, 'nullable', is_nullable, 'precision', datetime_precision, 'identity', is_identity, 'generated', is_generated)::text FROM information_schema.columns WHERE table_schema='public'
    UNION ALL SELECT jsonb_build_object('enum', t.typname, 'label', e.enumlabel, 'order', e.enumsortorder)::text FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'`;
  return catalog.map(r => r.data).sort();
}

type Row = Record<string, unknown>;
type Stored = { raw: string; row: Row };
export type Graph = Record<string, Stored[]>;
export async function readGraph(tx: Tx): Promise<Graph> {
   const graph: Graph = {};
   const collectedTables = [...families.map(f => f.table), 'rate_limit_buckets'];
   let count = BigInt(0), bytes = BigInt(0);
   // Return only aggregate metadata until the complete workload is admitted.
   // The caller holds all policy table locks across admission and collection.
   for (const table of collectedTables) {
     const [size] = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM (SELECT 1 FROM ${tableSQL(table)} LIMIT ${graphBudget.rows + 1}) t`);
     count += size.n;
     if (count > BigInt(graphBudget.rows)) throw new Error('Graph row budget exceeded');
   }
   for (const table of collectedTables) {
     const [size] = await tx.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT COALESCE(sum(octet_length(to_jsonb(t)::text)), 0)::bigint AS n FROM ${tableSQL(table)} t`);
     bytes += size.n;
     if (bytes > BigInt(graphBudget.bytes)) throw new Error('Graph serialized budget exceeded');
   }
   for (const table of collectedTables) {
    const rows = await tx.$queryRaw<{ data: string }[]>(Prisma.sql`SELECT to_jsonb(t)::text AS data FROM ${tableSQL(table)} t`);
    graph[table] = rows.map(r => ({ raw: r.data, row: JSON.parse(r.data) as Row }));
  }
  return graph;
}
// Resolve bindings against the complete graph. Scalar player references do not
// establish ownership, but a contradictory reference is never purged through.
export function selection(graph: Graph, game: string) {
  const map = (table: string) => new Map(graph[table].map(({ row }) => [row.id, row.gameId]));
  const players = map('players'), phases = map('operational_phases'), nominations = map('nominations');
  const games = new Set(graph.game_sessions.map(({ row }) => row.id));
  const owned: Graph = {}, retained: Graph = {};
  for (const { table } of families) {
    owned[table] = []; retained[table] = [];
    for (const entry of graph[table]) {
      const row = entry.row;
      let binding = row.gameId;
      if (table === 'game_sessions') binding = row.id;
      if (['player_claims','player_secrets','browser_sessions'].includes(table)) binding = row.playerId == null ? row.storytellerGameId : players.get(row.playerId);
      if (table === 'browser_sessions' && row.storytellerGameId != null) {
        if (binding !== row.storytellerGameId) throw new Error('Contradictory session binding');
        binding = row.storytellerGameId;
      }
      if (table === 'operational_actions') binding = phases.get(row.operationalPhaseId);
      if (table === 'votes') binding = nominations.get(row.nominationId);
      if (!games.has(binding)) throw new Error('Unowned game binding');
      const refs = ['sourcePlayerId','targetPlayerId','actorPlayerId','nominatorId','nomineeId','causedByPlayerId','currentExecutionCandidatePlayerId'];
      if (!['player_claims','player_secrets','browser_sessions'].includes(table)) refs.push('playerId');
      for (const ref of refs) if (row[ref] != null && players.get(row[ref]) !== binding) throw new Error('Cross-game scalar binding');
      (binding === game ? owned : retained)[table].push(entry);
    }
  }
  retained.rate_limit_buckets = graph.rate_limit_buckets;
  const hash = (g: Graph) => digest(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map(e => e.raw).sort()])));
  return { owned, retained, data: hash(owned), other: hash(retained), counts: Object.fromEntries(families.map(({ table }) => [table, owned[table].length])) };
}
export async function zeroResidue(tx: Tx, game: string, before: ReturnType<typeof selection>) {
  const after = await readGraph(tx);
  for (const { table } of families) {
    const selected = new Set(before.owned[table].map(e => e.row.id ?? e.row.playerId ?? e.row.gameId));
    if (after[table].some(e => e.row.gameId === game || e.row.storytellerGameId === game || selected.has(e.row.id ?? e.row.playerId ?? e.row.gameId))) throw new Error('Owned residue');
    // Remembered parent IDs catch indirect survivors even after parents vanish.
    for (const [field, parent] of [['playerId','players'], ['operationalPhaseId','operational_phases'], ['nominationId','nominations']] as const) {
      const ids = new Set(before.owned[parent].map(e => e.row.id));
      if (after[table].some(e => ids.has(e.row[field]))) throw new Error('Indirect residue');
    }
  }
  if (selection(after, game).other !== before.other) throw new Error('Retained graph changed');
}
