import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import net from 'node:net';
import { acquireLease, resolveTarget, stopOwnedServer } from './test-database.mjs';
import { buildIdentity, completeClaims } from './playable-recovery.mjs';
import { prepareCompatibilitySource, readCompatibilityReport } from './command-receipt-compatibility.mjs';
import { readProvenanceReport } from './provenance.mjs';

const hash = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
function git(root: string, args: string[]) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('Cannot inventory Git source');
  return r.stdout;
}
export function excluded(name: string): boolean {
  if (/\.sql$/i.test(name) && !/^prisma\/migrations\/[^/]+\/migration\.sql$/.test(name)) return true;
  return name.split('/').some(p => /^(\.git|node_modules|\.next|out|build|coverage|test-results|playwright-report|baseline-results|provenance-results|\.vercel|\.yarn)$/.test(p) || /^\.env/.test(p) || /\.(pem|key|p12|pfx|dump|tsbuildinfo)$/.test(p) || /^(id_rsa|id_ed25519|credentials.*|secrets?.*|next-env\.d\.ts|\.DS_Store)$/i.test(p));
}
export function capture(root: string, output?: string) {
  root = fs.realpathSync(root);
  const names = [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
  const omitted: { path: string; reason: string }[] = [];
  const entries: { path: string; mode: number; sha256: string; target?: string }[] = [];
  for (const name of names) {
    const src = path.join(root, name);
    if (excluded(name) || (output && (src === path.resolve(output) || src.startsWith(path.resolve(output) + path.sep)))) {
      omitted.push({ path: name, reason: 'secret/generated/output policy; bytes not read' }); continue;
    }
    if (!fs.lstatSync(src, { throwIfNoEntry: false })) { omitted.push({ path: name, reason: 'deleted' }); continue; }
    const st = fs.lstatSync(src);
    const dest = output && path.join(output, 'source', name);
    for (let parent = path.dirname(src); parent !== root; parent = path.dirname(parent)) {
      if (fs.lstatSync(parent).isSymbolicLink()) throw new Error(`Symlink directory refused: ${name}`);
    }
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(src);
      const resolved = path.resolve(path.dirname(src), target);
      if (!resolved.startsWith(root + path.sep)) throw new Error(`Escaping symlink refused: ${name}`);
      entries.push({ path: name, mode: st.mode & 0o777, sha256: hash(target), target });
      if (dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.symlinkSync(target, dest); }
    } else if (st.isFile()) {
      const bytes = fs.readFileSync(src);
      entries.push({ path: name, mode: st.mode & 0o777, sha256: hash(bytes) });
      if (dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, bytes, { mode: st.mode & 0o777 }); }
    } else throw new Error(`Unsupported source entry: ${name}`);
  }
  const ignored = git(root, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory']).split('\0').filter(Boolean);
  omitted.push(...ignored.map(name => ({ path: name, reason: 'Git ignored; bytes not read' })));
  const manifest = {
    schema: 1, sourceId: hash(JSON.stringify(entries)), head: git(root, ['rev-parse', 'HEAD']).trim(),
    observerSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    entries, excluded: omitted,
    tests: entries.filter(e => /\.(test|spec)\.ts$/.test(e.path)).map(e => e.path),
    planning: entries.filter(e => e.path.startsWith('docs/plans/')).map(e => e.path),
    status: git(root, ['status', '--porcelain=v1', '--untracked-files=all']),
  };
  if (output) {
    const diff = git(root, ['diff', '--binary', 'HEAD', '--', ...entries.map(e => e.path)]);
    fs.writeFileSync(path.join(output, 'tracked.patch'), diff);
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }
  return manifest;
}

type Manifest = ReturnType<typeof capture>;
export function verifySource(manifest: Manifest, root: string) {
  const before = new Map(manifest.entries.map(e => [e.path, e]));
  const changed = new Set<string>();
  // Reconstructions have no Git metadata. Inventory every policy-approved path,
  // including additions that a copied .gitignore might otherwise hide.
  const visit = (dir: string) => {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const relative = dir ? `${dir}/${name}` : name;
      if (excluded(relative)) continue;
      const file = path.join(root, relative); const st = fs.lstatSync(file);
      if (st.isDirectory()) { visit(relative); continue; }
      const expected = before.get(relative); before.delete(relative);
      const target = st.isSymbolicLink() ? fs.readlinkSync(file) : undefined;
      if (!expected || (!st.isFile() && !st.isSymbolicLink()) ||
          expected.mode !== (st.mode & 0o777) || expected.target !== target ||
          expected.sha256 !== hash(target ?? fs.readFileSync(file))) changed.add(relative);
    }
  };
  visit('');
  return [...new Set([...changed, ...before.keys()])].sort();
}
export async function assertPortFree(port: number) {
  // macOS can bind IPv4 and IPv6 separately, so probe both explicitly.
  for (const host of ['127.0.0.1', '::1']) {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', () => reject(new Error(`Server port ${port} occupied or unavailable; unrelated process left untouched`)));
      server.listen({ port, host }, () => server.close(error => error ? reject(error) : resolve()));
    });
  }
}
type Stage = { name: string; command: string; args: string[]; requires?: string[]; timeout?: number; env?: NodeJS.ProcessEnv; private?: boolean };
type StageResult = { name: string; status: 'passed' | 'failed' | 'blocked'; exit: number | null; signal?: string | null; reason?: string; command?: string; args?: string[]; started?: string; durationMs?: number };
export async function runStages(stages: Stage[], cwd: string, env: NodeJS.ProcessEnv, out: string, onResult?: (result: StageResult) => void | Promise<void>) {
  fs.mkdirSync(out, { recursive: true });
  const results: StageResult[] = [];
  let interrupted = false; let killActive: (() => void) | undefined;
  const stop = () => { interrupted = true; killActive?.(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    for (const stage of stages) {
      const missing = stage.requires?.filter(name => !results.some(r => r.name === name && r.status === 'passed')) ?? [];
      if (interrupted || missing.length) results.push({ name: stage.name, status: 'blocked', exit: null, reason: interrupted ? 'interrupted' : `prerequisite: ${missing.join(', ')}` });
      else {
        const logRoot = stage.private ? path.join(out, 'security-private') : out;
        fs.mkdirSync(logRoot, { recursive: true, mode: 0o700 });
        const started = Date.now(); const fd = fs.openSync(path.join(logRoot, stage.name + '.log'), 'w', 0o600);
        const child = spawn(stage.command, stage.args, { cwd, env: { ...env, ...stage.env }, detached: true, stdio: ['ignore', fd, fd] });
        let escalation: NodeJS.Timeout | undefined;
        let timedOut = false;
        const kill = () => {
          if (!child.pid || escalation) return;
          try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
          // Give Playwright its shutdown window to stop its own server group.
          escalation = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* Owned group already exited. */ } }, 10_000);
        };
        killActive = kill;
        const timeout = stage.timeout ?? 900_000;
        const timer = setTimeout(() => { timedOut = true; kill(); }, timeout);
        const result = await new Promise<StageResult>(resolve => {
          child.once('error', error => resolve({ name: stage.name, status: 'failed', exit: null, reason: error.message }));
          child.once('close', (exit, signal) => resolve({ name: stage.name, status: exit === 0 && !interrupted && !timedOut ? 'passed' : 'failed', exit, signal,
            ...(timedOut ? { reason: `timeout after ${timeout}ms` } : {}) }));
        });
        clearTimeout(timer); clearTimeout(escalation); killActive = undefined; fs.closeSync(fd);
        results.push({ ...result, command: stage.command, args: stage.args, started: new Date(started).toISOString(), durationMs: Date.now() - started });
      }
      fs.writeFileSync(path.join(out, 'stages.json'), JSON.stringify(results, null, 2));
      await onResult?.(results[results.length - 1]);
    }
  } finally { killActive?.(); process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  return results;
}
type UnitReport = { testResults: { name: string; assertionResults: { ancestorTitles: string[]; title: string; status: string; failureMessages: string[] }[] }[] };
type BrowserSuite = { suites?: BrowserSuite[]; specs?: { id: string; file: string; title: string; tests: { projectName: string; expectedStatus: string; results: { status: string; errors?: unknown[]; attachments?: unknown[] }[] }[] }[] };
type BrowserEntry = { id: string; file: string; title: string; project: string; expectedStatus: string; results: { status: string; errors?: unknown[]; attachments?: unknown[] }[] };
function browserInventory(report: BrowserSuite): BrowserEntry[] {
  return [...(report.specs ?? []).flatMap(spec => spec.tests.map(test => ({
    id: `${spec.id}:${test.projectName}`, file: spec.file, title: spec.title, project: test.projectName,
    expectedStatus: test.expectedStatus, results: test.results,
  }))), ...(report.suites ?? []).flatMap(browserInventory)];
}
export function readInventories(out: string, browserBlockedReason?: string) {
  const read = (name: string) => {
    try { return JSON.parse(fs.readFileSync(path.join(out, name), 'utf8')); }
    catch { throw new Error(`Missing or truncated native report: ${name}`); }
  };
  const unit: UnitReport = read('unit.json');
  const discovered: { file: string; name: string }[] = read('unit-discovery.json');
  const unitTests = unit.testResults.flatMap(suite => suite.assertionResults.map(test => ({
    id: `${suite.name}:${[...test.ancestorTitles, test.title].join(' > ')}`, file: suite.name, ...test,
  })));
  const expected = discovered.map(t => `${t.file}:${t.name}`).sort();
  if (!expected.length || JSON.stringify(expected) !== JSON.stringify(unitTests.map(t => t.id).sort())) throw new Error('Incomplete unit discovery/outcome inventory');
  const browserDiscovered = browserInventory(read('browser-discovery.json'));
  const browser = browserBlockedReason
    ? browserDiscovered.map(t => ({ ...t, results: [{ status: 'blocked', errors: [browserBlockedReason] }] }))
    : browserInventory(read('browser.json'));
  if (!browser.length || JSON.stringify(browser.map(t => t.id).sort()) !== JSON.stringify(browserDiscovered.map(t => t.id).sort()) || browser.some(t => !t.results.length)) throw new Error('Incomplete browser discovery/outcome inventory');
  return { unit: unitTests, browser, counts: {
    unit: Object.fromEntries(['passed', 'failed', 'pending', 'skipped', 'todo'].map(status => [status, unitTests.filter(t => t.status === status).length])),
    browser: Object.fromEntries(['passed', 'failed', 'timedOut', 'skipped', 'interrupted', 'blocked'].map(status => [status, browser.filter(t => t.results[0].status === status).length])),
  } };
}

export function readRecoveryInventory(out: string) {
  const read = (name: string) => {
    try { return JSON.parse(fs.readFileSync(path.join(out, name), 'utf8')); }
    catch { throw new Error(`Missing or truncated recovery report: ${name}`); }
  };
  const specs = (s: { specs?: { id: string }[]; suites?: typeof s[] }): { id: string }[] => [...(s.specs ?? []), ...(s.suites ?? []).flatMap(specs)];
  const discovered = specs(read('recovery-discovery.json')).map(s => s.id).sort();
  const native = read('recovery-native.json') as { cases: { id: string; results: { status: string }[] }[] };
  if (!discovered.length || !Array.isArray(native.cases) || JSON.stringify(discovered) !== JSON.stringify(native.cases.map(c => c.id).sort()) || native.cases.some(c => !c.results.length)) throw new Error('Incomplete recovery discovery/outcome inventory');
  return { discovered, cases: native.cases };
}
export function readSecurityInventory(out: string) {
  const read = (name: string) => {
    try { return browserInventory(JSON.parse(fs.readFileSync(path.join(out, 'security-private', name), 'utf8'))); }
    catch { throw new Error('Missing or truncated security inventory'); }
  };
  const discovered = read('discovery.json');
  const outcomes = read('native.json');
  if (!discovered.length || JSON.stringify(discovered.map(t => t.id).sort()) !== JSON.stringify(outcomes.map(t => t.id).sort()) || outcomes.some(t => !t.results.length)) throw new Error('Incomplete security discovery/outcome inventory');
  // Deliberate allowlist: no error messages, attachments, bodies or stdout.
  const cases = outcomes.map(t => ({ id: t.id, file: t.file, title: t.title, project: t.project, statuses: t.results.map(r => r.status) }));
  return { status: cases.every(t => t.statuses.every(s => s === 'passed')) ? 'passed' : 'failed', cases };
}
export async function measure(root: string, out: string, profile: 'development' | 'production', reference?: string) {
  root = fs.realpathSync(root); out = path.resolve(out);
  if (fs.existsSync(out)) throw new Error('Use a new run directory; earlier evidence is immutable');
  const target = resolveTarget();
  const lease = acquireLease(target, 3100);
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const metadata: Record<string, unknown> = { schema: 1, runId: path.basename(out), profile, started: new Date().toISOString(),
    node: process.version, platform: os.platform(), arch: os.arch(), release: os.release(),
    timezone: 'UTC', locale: 'en_US.UTF-8', target: target.public, retries: 0, workers: 1 };
  const write = () => fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify(metadata, null, 2));
  write();
  fs.writeFileSync(path.join(out, 'security-summary.json'), JSON.stringify({ status: 'blocked', reason: 'Security stage has not completed' }));
  try {
    await assertPortFree(3100);
    // This exact Git object must be materialized while history is available;
    // workers inside the captured B source tree cannot substitute current code.
    metadata.compatibilityProducer = prepareCompatibilitySource(root, path.join(out, 'compatibility-A'));
    const manifest = capture(root, path.join(out, 'capsule'));
    const work = path.join(out, 'capsule/source');
    metadata.sourceId = manifest.sourceId; metadata.observerSha256 = manifest.observerSha256;
    if (reference) {
      const ref: Manifest = JSON.parse(fs.readFileSync(reference, 'utf8'));
      const before = new Map(ref.entries.map(e => [e.path, e.sha256]));
      const after = new Map(manifest.entries.map(e => [e.path, e.sha256]));
      const changed = [...new Set([...before.keys(), ...after.keys()])].filter(name => before.get(name) !== after.get(name)).sort();
      const appChanges = changed.filter(name => /^(src|public|protected|prisma)\//.test(name));
      const packageBefore = JSON.parse(fs.readFileSync(path.join(path.dirname(reference), 'source/package.json'), 'utf8'));
      const packageAfter = JSON.parse(fs.readFileSync(path.join(work, 'package.json'), 'utf8'));
      const dependenciesChanged = ['dependencies', 'devDependencies'].some(key => JSON.stringify(packageBefore[key]) !== JSON.stringify(packageAfter[key]));
      metadata.reference = { sourceId: ref.sourceId, changed, appChanges, dependenciesChanged };
      if (appChanges.length || dependenciesChanged) throw new Error('Application/dependency delta exceeds baseline scope');
    }
    const env = { ...target.env, BASELINE_DB_LEASE: lease.token, BASELINE_PROFILE: profile,
      APP_ORIGIN: 'http://localhost:3100', STORYTELLER_RECOVERY_SECRET: crypto.randomUUID(),
      TZ: 'UTC', LANG: 'en_US.UTF-8', NEXT_TELEMETRY_DISABLED: '1', CI: '1',
      PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(out, 'browser.json'),
      PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(out, 'html') };
    const stage = (name: string, command: string, args: string[], requires = ['install']): Stage => ({ name, command, args, requires });
    const stages = [
      stage('install', 'npm', ['ci', '--no-audit', '--no-fund'], []),
      stage('versions', 'npm', ['ls', '--depth=0']),
      stage('npm-version', 'npm', ['--version']),
      stage('browser-version', process.execPath, ['-e', "(async () => { const b = await require('@playwright/test').chromium.launch(); console.log(b.version()); await b.close(); })().catch(e => { console.error(e.message); process.exitCode = 1; })"]),
      stage('lint', 'npm', ['run', 'lint']),
      stage('types', 'npm', ['run', 'typecheck', '--', '--incremental', 'false']),
      stage('generate', 'npm', ['run', 'db:generate']),
      stage('compatibility', 'npx', ['tsx', 'scripts/command-receipt-compatibility.mts', 'run', path.join(out, 'compatibility-A'), path.join(out, 'compatibility'), manifest.sourceId], ['generate']),
      stage('reset-unit', 'npx', ['tsx', 'scripts/test-database.mts', 'reset'], ['generate']),
      stage('postgres-version', 'psql', ['-Atc', 'SELECT version()'], ['reset-unit']),
      stage('unit-discovery', 'npx', ['vitest', 'list', '--staticParse=false', '--json=' + path.join(out, 'unit-discovery.json')], ['generate']),
      stage('unit', 'npm', ['test', '--', '--reporter=default', '--reporter=json', '--outputFile=' + path.join(out, 'unit.json')], ['reset-unit']),
      stage('clean-database', 'bash', ['scripts/verify-clean-db.sh'], ['unit', 'generate']),
      stage('build', 'npm', ['run', 'build']),
      stage('provenance', 'npx', ['tsx', 'scripts/provenance.mts', 'check', '--output', path.join(out, 'provenance'), '--source-id', manifest.sourceId, '--build-record', path.join(out, 'run.json')], ['build']),
      ...(profile === 'development' ? [stage('fresh-dev-output', process.execPath, ['-e', "require('node:fs').rmSync('.next', { recursive: true, force: true })"])] : []),
      stage('reset-browser', 'npx', ['tsx', 'scripts/test-database.mts', 'reset'], ['generate']),
      stage('browser-discovery', 'npx', ['playwright', 'test', '--list', '--reporter=json']),
      stage('browser', 'npm', ['run', 'test:e2e', '--', '--reporter=list,json', '--output=' + path.join(out, 'browser-artifacts')], ['reset-browser', ...(profile === 'production' ? ['build'] : [])]),
      ...(profile === 'production' ? [stage('recovery', 'npm', ['run', 'recovery:prove', '--', '--output', path.join(out, 'recovery'), '--build-record', path.join(out, 'run.json')], ['build', 'generate'])] : []),
      stage('reset-security', 'npx', ['tsx', 'scripts/test-database.mts', 'reset'], ['generate']),
      { ...stage('security-discovery', 'npm', ['run', 'test:security', '--', '--list', '--reporter=json']), private: true,
        env: { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(out, 'security-private/discovery.json') } },
      { ...stage('security', 'npm', ['run', 'test:security', '--', '--reporter=list,json', '--output=' + path.join(out, 'security-private/artifacts')], ['reset-security', ...(profile === 'production' ? ['build'] : [])]), private: true,
        env: { ...env, RATE_LIMIT_DISABLED: '0', PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(out, 'security-private/native.json') } },
    ];
    // Discovery writes to a different native reporter file; it must not overwrite outcomes.
    stages.find(s => s.name === 'browser-discovery')!.env = { ...env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(out, 'browser-discovery.json') };
    stages.find(s => s.name === 'build')!.env = { ...env, NODE_ENV: 'production' };
    const results = await runStages(stages, work, env, out, async result => {
      if (result.name === 'build' && result.status === 'passed') {
        const build = path.join(work, '.next/BUILD_ID');
        if (fs.existsSync(build)) metadata.build = buildIdentity(work, manifest.sourceId);
      }
      if (result.name === 'provenance') {
        try { metadata.provenance = readProvenanceReport(path.join(out, 'provenance'), work, manifest.sourceId, metadata.build as ReturnType<typeof buildIdentity>); }
        catch { metadata.provenance = { complete: false, reason: 'Provenance evidence missing, failed, stale or incomplete' }; }
      }
      if (result.name === 'browser') {
        await stopOwnedServer(target, lease.token);
        await assertPortFree(3100);
        lease.releasePort(lease.token);
        metadata.serverPortReleased = true;
      }
      if (result.name === 'recovery' || (profile === 'development' && result.name === 'browser')) {
        lease.acquirePort(lease.token);
        await assertPortFree(3100);
        metadata.securityPortReacquired = true;
      }
      if (result.name === 'security') {
        await stopOwnedServer(target, lease.token);
        await assertPortFree(3100);
      }
      write();
    });
    metadata.stages = results;
    metadata.provenance ??= { complete: false, reason: 'Provenance stage did not complete' };
    if (profile === 'production') {
      try { metadata.provenance = readProvenanceReport(path.join(out, 'provenance'), work, manifest.sourceId, metadata.build as ReturnType<typeof buildIdentity>); }
      catch { metadata.provenance = { complete: false, reason: 'Final provenance artifacts or source/build identity failed revalidation' }; }
    }
    try { metadata.compatibility = readCompatibilityReport(path.join(out, 'compatibility/compatibility.json'), manifest.sourceId); }
    catch { metadata.compatibility = { complete: false, reason: 'Compatibility report missing, failed or incomplete' }; }
    try { metadata.security = readSecurityInventory(out); }
    catch { metadata.security = { status: 'failed', reason: 'Security inventory missing or incomplete' }; }
    fs.writeFileSync(path.join(out, 'security-summary.json'), JSON.stringify(metadata.security, null, 2));
    if (profile === 'development') metadata.recovery = { status: 'not-applicable', reason: 'Physical recovery requires the production build; development output is deliberately rebuilt by the dev server' };
    else {
      const recoveryStage = results.find(s => s.name === 'recovery');
      if (recoveryStage?.status === 'blocked') metadata.recovery = { status: 'blocked', reason: recoveryStage.reason };
      else {
        try {
          const inventory = readRecoveryInventory(path.join(out, 'recovery'));
          const report = JSON.parse(fs.readFileSync(path.join(out, 'recovery/recovery.json'), 'utf8'));
          if (!report.complete || !report.cleanup?.complete || !completeClaims(report.claims) || inventory.cases.some(c => c.results.some(r => r.status !== 'passed'))) throw new Error('Recovery claims or native outcomes incomplete');
          metadata.recovery = { status: 'passed', inventory, report };
        } catch (error) { metadata.recovery = { status: 'failed', reason: (error as Error).message }; }
      }
    }
    let rawFailures = true;
    try {
      const browserStage = results.find(s => s.name === 'browser');
      const inventory = readInventories(out, browserStage?.status === 'blocked' ? browserStage.reason : undefined); metadata.inventory = inventory;
      rawFailures = inventory.unit.some(t => t.status === 'failed') || inventory.browser.some(t => t.results.some(r => ['failed', 'timedOut', 'interrupted'].includes(r.status)));
    }
    catch (error) { metadata.inventoryError = (error as Error).message; }
    metadata.changedSource = verifySource(manifest, work);
    metadata.originalSourceUnchanged = capture(root).sourceId === manifest.sourceId;
    await stopOwnedServer(target, lease.token);
    await assertPortFree(3100); metadata.serverPortReleased = true;
    metadata.complete = results.every(s => s.status === 'passed') && (metadata.provenance as { complete: boolean }).complete && (metadata.compatibility as { complete: boolean }).complete && (metadata.security as { status: string }).status === 'passed' && !rawFailures && !metadata.inventoryError && !(metadata.changedSource as string[]).length && metadata.originalSourceUnchanged && (profile !== 'production' || (!!metadata.build && (metadata.recovery as { status: string }).status === 'passed'));
    write();
    return metadata.complete === true;
  } catch (error) { metadata.complete = false; metadata.blocker = (error as Error).message; write(); return false; }
  finally {
    await stopOwnedServer(target, lease.token);
    lease.release(); metadata.cleanup = 'owned subprocesses ended; leases released; source and evidence retained'; write();
  }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , root, output, profile, reference] = process.argv;
  if (root === 'run') {
    if (!output || !['development', 'production'].includes(profile)) throw new Error('Usage: npm run baseline -- run NEW_OUTPUT development|production [S0_MANIFEST]');
    process.exitCode = await measure(process.cwd(), output, profile as 'development' | 'production', reference) ? 0 : 1;
  } else {
    if (!root) throw new Error('Usage: npx tsx scripts/regression-baseline.mts SOURCE [NEW_CAPSULE]');
    if (output && fs.existsSync(output)) throw new Error('Capsule must not already exist');
    const m = capture(root, output);
    console.log(JSON.stringify({ sourceId: m.sourceId, files: m.entries.length, tests: m.tests.length }));
  }
}
