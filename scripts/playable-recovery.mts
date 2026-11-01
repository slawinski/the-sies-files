import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireLease, assertLease, resolveTarget, type Target } from './test-database.mjs';
import { assertPortFree, capture, verifySource } from './regression-baseline.mjs';

const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
function safeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^(?:Missing required continuation evidence|Incomplete or failed native recovery inventory|Recovery worker did not complete required evidence|Source\/build fingerprint mismatch|Recorded build mismatch|Build identity changed|Application (?:launch failed|exited before readiness|readiness timed out)|(?:pg_dump|pg_restore|createdb|dropdb|psql|npm|npx) failed \(exit (?:\d+|unavailable)\))$/.test(message)
    ? message : 'Recovery stage failed; private details withheld';
}
export const REQUIRED_CLAIMS = ['archiveRestoration', 'durableRows', 'runtimeProjections', 'persistedSessions', 'duplicateEffectFree', 'legalContinuation'] as const;
export function completeClaims(value: unknown): boolean {
  return !!value && typeof value === 'object' && REQUIRED_CLAIMS.every(k => (value as Record<string, unknown>)[k] === true);
}

// Never include stdout/stderr, argv, environment, URLs or row values in errors.
// The native tools receive credentials only through their private environment.
function command(exe: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const r = spawnSync(exe, args, { env, cwd, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${path.basename(exe)} failed (exit ${r.status ?? 'unavailable'})`);
  return r.stdout.trim();
}

export function derivedTarget(base: Target, kind: 'source' | 'target') {
  const url = new URL(base.env.DATABASE_URL!);
  url.pathname = `/recovery_${kind}_${randomBytes(10).toString('hex')}_test`;
  return resolveTarget({ ...base.env, DATABASE_URL: url.href, E2E_DATABASE_URL: url.href });
}

/** A collision never transfers ownership: only a successful CREATE enables DROP. */
export function ownedDatabase(target: Target, port?: number) {
  const lease = acquireLease(target, port);
  let created = false;
  return {
    target, token: lease.token,
    create(cwd = process.cwd()) {
      assertLease(target, lease.token);
      command('createdb', ['--template=template0', target.database], target.env, cwd);
      created = true;
    },
    cleanup(cwd = process.cwd()) {
      assertLease(target, lease.token);
      if (created) { command('dropdb', [target.database], target.env, cwd); created = false; }
      lease.release();
    },
    get created() { return created; },
  };
}

export function preflight(base: Target, cwd = process.cwd()) {
  const tools = Object.fromEntries(['psql', 'createdb', 'dropdb', 'pg_dump', 'pg_restore'].map(tool => {
    const version = command(tool, ['--version'], base.env, cwd);
    if (!/\(PostgreSQL\) 16\./.test(version)) throw new Error(`PostgreSQL 16 ${tool} required`);
    return [tool, version];
  }));
  const server = command('psql', ['-XAt', '--dbname=postgres', '-c', 'SHOW server_version_num'], base.env, cwd);
  if (!/^16\d{4}$/.test(server)) throw new Error('PostgreSQL 16 server required');
  return { tools, server };
}

async function terminate(child: ChildProcess) {
  if (!child.pid) return;
  const gone = new Promise<void>(resolve => child.once('close', () => resolve()));
  // A Next process may have exited while descendants still own its group.
  try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
  await Promise.race([gone, new Promise(resolve => setTimeout(resolve, 5000))]);
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Entire owned group ended. */ }
  if (child.exitCode === null && child.signalCode === null) await gone;
}

export function buildIdentity(work: string, sourceId: string) {
  const artifacts: [string, string][] = [];
  const visit = (dir: string) => {
    for (const name of fs.readdirSync(path.join(work, '.next', dir)).sort()) {
      if (!dir && ['cache', 'diagnostics', 'trace', 'trace-build', 'dev', 'lock'].includes(name)) continue;
      const relative = path.join(dir, name);
      const file = path.join(work, '.next', relative);
      if (fs.statSync(file).isDirectory()) visit(relative);
      else artifacts.push([relative, hash(fs.readFileSync(file))]);
    }
  };
  visit('');
  const migrations = fs.readdirSync(path.join(work, 'prisma/migrations')).sort()
    .filter(n => fs.existsSync(path.join(work, 'prisma/migrations', n, 'migration.sql')))
    .map(n => [n, hash(fs.readFileSync(path.join(work, 'prisma/migrations', n, 'migration.sql')))]);
  return { sourceId, id: fs.readFileSync(path.join(work, '.next/BUILD_ID'), 'utf8').trim(),
    lockSha256: hash(fs.readFileSync(path.join(work, 'package-lock.json'))),
    artifactSha256: hash(JSON.stringify(artifacts)),
    schemaSha256: hash(fs.readFileSync(path.join(work, 'prisma/schema.prisma'))), migrationsSha256: hash(JSON.stringify(migrations)) };
}

type NegativeControl = 'corrupt-archive' | 'missing-continuation' | 'worker-exit' | 'dump-failure' | 'launch-failure' | 'readiness-failure' | 'parent-cancel';
type Options = { output: string; buildRecord?: string; negativeControl?: NegativeControl };
export async function proveRecovery(options: Options) {
  const base = resolveTarget(); // Fail before subprocesses, allocations, or output writes.
  const out = path.resolve(options.output);
  if (fs.existsSync(out)) throw new Error('New recovery output directory required');
  const versions = preflight(base);
  const sourceTarget = derivedTarget(base, 'source');
  const targetTarget = derivedTarget(base, 'target');
  let source: ReturnType<typeof ownedDatabase> | undefined;
  let target: ReturnType<typeof ownedDatabase> | undefined;
  let app: ChildProcess | undefined;
  let worker: ChildProcess | undefined;
  let ipc: net.Server | undefined;
  let privateDir: string | undefined;
  let work = process.cwd();
  let manifest: ReturnType<typeof capture> | undefined;
  let identity: ReturnType<typeof buildIdentity> | undefined;
  let evidenceComplete = false;
  let stage = 'preflight';
  const report: Record<string, unknown> = { schema: 1, runId: path.basename(out), started: new Date().toISOString(), node: process.version, versions,
    databases: { source: sourceTarget.public, target: targetTarget.public },
    claims: Object.fromEntries(REQUIRED_CLAIMS.map(k => [k, false])), stages: [], cleanup: 'pending', complete: false };
  const stages = report.stages as { name: string; at: string }[];
  let interrupted = false;
  const enter = (name: string) => { if (interrupted) throw new Error('Recovery cancelled'); stage = name; stages.push({ name, at: new Date().toISOString() }); };
  const cancel = () => { interrupted = true; if (worker) void terminate(worker); };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  try {
    source = ownedDatabase(sourceTarget, 3100);
    target = ownedDatabase(targetTarget);
    await assertPortFree(3100);
    fs.mkdirSync(out, { recursive: true, mode: 0o700 });
    privateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sies-recovery-'));
    fs.chmodSync(privateDir, 0o700);
    enter('build');
    let sourceId: string;
    if (options.buildRecord) {
      const record = JSON.parse(fs.readFileSync(options.buildRecord, 'utf8'));
      report.baselineRunId = typeof record.runId === 'string' ? record.runId.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 128) : null;
      manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(options.buildRecord), 'capsule/manifest.json'), 'utf8')) as ReturnType<typeof capture>;
      if (verifySource(manifest, work).length || !record.build || record.build.sourceId !== manifest.sourceId) throw new Error('Source/build fingerprint mismatch');
      sourceId = manifest.sourceId;
      const actual = buildIdentity(work, sourceId);
      if (Object.entries(record.build).some(([key, value]) => actual[key as keyof typeof actual] !== value) || !record.build.artifactSha256) throw new Error('Recorded build mismatch');
    } else {
      manifest = capture(work, path.join(out, 'capsule'));
      sourceId = manifest.sourceId; work = path.join(out, 'capsule/source');
      command('npm', ['ci', '--no-audit', '--no-fund'], base.env, work);
      command('npm', ['run', 'build'], { ...base.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' }, work);
    }
    identity = buildIdentity(work, sourceId);
    report.build = identity;
    enter('create-source'); source.create(work);
    command('npx', ['prisma', 'migrate', 'deploy'], sourceTarget.env, work);
    const archive = path.join(privateDir, 'database.dump');
    const start = async (db: Target) => {
      if (app) throw new Error('Owned app still active');
      await assertPortFree(3100);
      if (JSON.stringify(buildIdentity(work, sourceId)) !== JSON.stringify(identity)) throw new Error('Build identity changed');
      app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', options.negativeControl === 'launch-failure' ? 'invalid' : '3100'], {
        cwd: work, env: { ...db.env, NODE_ENV: 'production', RATE_LIMIT_DISABLED: '1', NEXT_TELEMETRY_DISABLED: '1' }, detached: true, stdio: 'ignore',
      });
      app.on('error', () => { /* Readiness observes failed spawn without logging env. */ });
      const pid = app.pid;
      if (!pid) throw new Error('Application launch failed');
      for (let i = 0; i < (options.negativeControl === 'readiness-failure' ? 10 : 300); i++) {
        if (interrupted || app.exitCode !== null || app.signalCode !== null) throw new Error('Application exited before readiness');
        try { if ((await fetch('http://localhost:3100' + (options.negativeControl === 'readiness-failure' ? '/not-a-recovery-readiness-page' : ''), { signal: AbortSignal.timeout(1000) })).ok) return pid; } catch { /* bounded readiness */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Application readiness timed out');
    };
    let lifecycle = 'created';
    const token = randomUUID();
    const socket = path.join(privateDir, 'ipc.sock');
    // Short private Unix-domain IPC, not an application endpoint or TCP service.
    let pending = false;
    ipc = net.createServer(connection => {
      connection.setTimeout(180_000, () => connection.destroy());
      let data = '';
      connection.on('data', chunk => {
        data += chunk.toString();
        if (data.length > 4096) { connection.destroy(); return; }
        if (!data.includes('\n')) return;
        void (async () => {
          if (pending) throw new Error('Concurrent lifecycle request refused');
          pending = true;
          try {
            const msg = JSON.parse(data);
            if (msg.token !== token || interrupted) throw new Error('IPC authorization refused');
            if (msg.action === 'start-source' && lifecycle === 'created') {
              enter('serve-source'); const pid = await start(sourceTarget); report.sourcePid = pid; lifecycle = 'source';
              if (options.negativeControl === 'worker-exit') setTimeout(() => { if (worker) void terminate(worker); }, 10);
              if (options.negativeControl === 'parent-cancel') setTimeout(() => process.kill(process.pid, 'SIGTERM'), 10);
              return { pid };
            }
            if (msg.action === 'restore-target' && lifecycle === 'source') {
              enter('stop-source'); await terminate(app!); app = undefined; await assertPortFree(3100);
              enter('dump');
              if (options.negativeControl === 'dump-failure') fs.mkdirSync(archive);
              command('pg_dump', ['--format=custom', '--file=' + archive], sourceTarget.env, work);
              if (options.negativeControl === 'corrupt-archive') fs.truncateSync(archive, 20);
              enter('create-target'); target!.create(work);
              enter('restore'); command('pg_restore', ['--exit-on-error', '--no-owner', '--no-acl', '--dbname=' + targetTarget.database, archive], targetTarget.env, work);
              (report.claims as Record<string, boolean>).archiveRestoration = true;
              // Worker compares durable rows before any target application requests.
              lifecycle = 'restored'; return { restored: true };
            }
            if (msg.action === 'start-target' && lifecycle === 'restored') {
              enter('serve-target'); const pid = await start(targetTarget); report.targetPid = pid;
              if (pid === report.sourcePid) throw new Error('Fresh process identity required');
              lifecycle = 'target'; return { pid };
            }
            if (msg.action === 'complete' && lifecycle === 'target') {
              enter('continuation');
              if (options.negativeControl === 'missing-continuation' || !completeClaims(msg.claims)) throw new Error('Missing required continuation evidence');
              report.claims = Object.fromEntries(REQUIRED_CLAIMS.map(k => [k, true]));
              report.browser = typeof msg.browser === 'string' ? msg.browser.replace(/[^0-9.]/g, '').slice(0, 40) : 'unverified';
              lifecycle = 'verified'; return { accepted: true };
            }
            throw new Error('Invalid lifecycle transition');
          } finally { pending = false; }
        })().then(value => connection.end(JSON.stringify({ value }) + '\n'), error => {
          report.failureStage = stage;
          report.failure ??= safeFailure(error);
          connection.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Lifecycle failed' }) + '\n');
        });
      });
      connection.on('error', () => { /* Worker died; parent still owns cleanup. */ });
    });
    await new Promise<void>((resolve, reject) => { ipc!.once('error', reject); ipc!.listen(socket, resolve); });
    fs.chmodSync(socket, 0o600);
    enter('worker');
    const env = { ...sourceTarget.env, SIES_RECOVERY_SOCKET: socket, SIES_RECOVERY_TOKEN: token,
      SIES_RECOVERY_TARGET_URL: targetTarget.env.DATABASE_URL, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(privateDir, 'native.json') };
    command('npx', ['playwright', 'test', '--config=playwright.recovery.config.ts', '--list', '--reporter=json'], { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(out, 'recovery-discovery.json') }, work);
    worker = spawn('npx', ['playwright', 'test', '--config=playwright.recovery.config.ts', '--reporter=json'], { cwd: work, env, detached: true, stdio: 'ignore' });
    const timer = setTimeout(() => { interrupted = true; void terminate(worker!); }, 240_000);
    const exit = await new Promise<number | null>(resolve => { worker!.once('error', () => resolve(null)); worker!.once('close', resolve); });
    clearTimeout(timer);
    // Only a credential-free inventory is retained. Native error/attachments
    // may contain private DTOs, so raw native output stays in the private dir.
    const discovery = JSON.parse(fs.readFileSync(path.join(out, 'recovery-discovery.json'), 'utf8'));
    const native = JSON.parse(fs.readFileSync(path.join(privateDir, 'native.json'), 'utf8'));
    const inventory = (s: { suites?: unknown[]; specs?: unknown[] }): unknown[] => [ ...(s.specs ?? []), ...(s.suites ?? []).flatMap(v => inventory(v as typeof s)) ];
    const discovered = inventory(discovery) as { id: string }[];
    const outcomes = inventory(native) as { id: string; tests: { results: { status: string; errors?: { message?: string; stack?: string }[] }[] }[] }[];
    const cases = outcomes.map(c => ({ id: c.id, results: c.tests.flatMap(t => t.results.map(r => ({ status: r.status,
      failures: (r.errors ?? []).map(e => ({
        reason: /Recovery comparison failed: [a-zA-Z0-9 _-]+/.exec(e.message ?? '')?.[0] ?? 'Native assertion failed; private values withheld',
        frames: ((e.stack ?? '') + (e.message ?? '')).match(/(?:e2e-11-playable-recovery\.spec|recovery-fixtures)\.ts:\d+:\d+/g) ?? [],
      })),
    }))) }));
    fs.writeFileSync(path.join(out, 'recovery-native.json'), JSON.stringify({ cases }, null, 2), { mode: 0o600 });
    if (!discovered.length || JSON.stringify(discovered.map(c => c.id).sort()) !== JSON.stringify(cases.map(c => c.id).sort()) || cases.some(c => !c.results.length || c.results.some(r => r.status !== 'passed'))) throw new Error('Incomplete or failed native recovery inventory');
    if (exit !== 0 || interrupted || lifecycle !== 'verified' || !completeClaims(report.claims)) throw new Error('Recovery worker did not complete required evidence');
    evidenceComplete = true;
  } catch (error) {
    report.complete = false; report.failureStage ??= stage;
    // Only our fixed stage errors escape. Never persist an untrusted exception.
    report.failure ??= safeFailure(error);
  } finally {
    process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
    const failures: string[] = [];
    for (const [name, cleanup] of [
      ['worker', async () => { if (worker) await terminate(worker); }],
      ['app', async () => { if (app) await terminate(app); }],
      ['ipc', async () => { ipc?.close(); }],
      ['target', async () => target?.cleanup(work)],
      ['source', async () => source?.cleanup(work)],
      ['private-archive', async () => { if (privateDir) fs.rmSync(privateDir, { recursive: true, force: true }); }],
    ] as const) { try { await cleanup(); } catch { failures.push(name); } }
    // Check the original specimen only after worker/app shutdown. A successful
    // continuation cannot excuse late source or compiled-artifact drift, and a
    // failed fingerprint must not prevent any owned-resource cleanup above.
    let fingerprintComplete = false;
    if (manifest && identity) {
      stages.push({ name: 'fingerprint', at: new Date().toISOString() });
      try {
        if (verifySource(manifest, work).length) throw new Error('Source/build fingerprint mismatch');
        if (JSON.stringify(buildIdentity(work, identity.sourceId)) !== JSON.stringify(identity)) throw new Error('Build identity changed');
        fingerprintComplete = true;
        report.fingerprint = { complete: true };
      } catch (error) {
        const failure = safeFailure(error);
        report.fingerprint = { complete: false, failure };
        report.failureStage ??= 'fingerprint';
        report.failure ??= failure;
      }
    }
    report.cleanup = { complete: !failures.length, failed: failures };
    report.cancelled = interrupted;
    report.complete = evidenceComplete && fingerprintComplete && !failures.length;
    report.finished = new Date().toISOString();
    if (fs.existsSync(out)) fs.writeFileSync(path.join(out, 'recovery.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  }
  return report.complete === true;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options: Options = { output: path.join('baseline-results', `recovery-${Date.now()}-${randomBytes(4).toString('hex')}`) };
  for (let i = 0; i < args.length; i += 2) {
    if (!['--output', '--build-record', '--negative-control'].includes(args[i]) || !args[i + 1]) throw new Error('Use --output NEW_DIRECTORY [--build-record BASELINE_RUN_JSON]');
    if (args[i] === '--output') options.output = args[i + 1];
    if (args[i] === '--build-record') options.buildRecord = path.resolve(args[i + 1]);
    if (args[i] === '--negative-control') {
      if (!['corrupt-archive', 'missing-continuation', 'worker-exit', 'dump-failure', 'launch-failure', 'readiness-failure', 'parent-cancel'].includes(args[i + 1])) throw new Error('Unknown negative control');
      options.negativeControl = args[i + 1] as Options['negativeControl'];
    }
  }
  try { process.exitCode = await proveRecovery(options) ? 0 : 1; }
  catch { console.error('Recovery preflight refused; explicit local disposable URL, PostgreSQL 16 tools and new output required'); process.exitCode = 1; }
}
