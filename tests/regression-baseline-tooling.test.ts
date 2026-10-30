import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { capture, runStages, verifySource, assertPortFree, readInventories } from '../scripts/regression-baseline.mjs';
import { hasSuccessionPrerequisites, scenarioSpecimen, commandVersion } from './e2e/fixtures';
import { createServer } from 'node:http';
import { request } from '@playwright/test';
import { generateSetupCandidate } from '../src/modules/setup/generator';
import { SeededRngV2 } from '../src/lib/rng';

const trees: string[] = [];
afterEach(() => { for (const tree of trees.splice(0)) fs.rmSync(tree, { recursive: true, force: true }); });
function tree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-contract-'));
  trees.push(dir);
  execFileSync('git', ['init', '-q', dir]);
  fs.writeFileSync(path.join(dir, 'source.ts'), 'original');
  fs.writeFileSync(path.join(dir, '.env.secret'), 'DO NOT CAPTURE');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], { cwd: dir });
  return dir;
}
test('reconstructs dirty and untracked source with metadata without changing original', () => {
  const dir = tree();
  fs.writeFileSync(path.join(dir, 'source.ts'), 'edited');
  fs.writeFileSync(path.join(dir, 'extra.test.ts'), 'test');
  fs.chmodSync(path.join(dir, 'source.ts'), 0o755);
  fs.symlinkSync('source.ts', path.join(dir, 'link'));
  const before = capture(dir);
  const out = path.join(dir, 'baseline-results', 's0');
  const result = capture(dir, out);
  expect(result.sourceId).toBe(before.sourceId);
  expect(fs.readFileSync(path.join(out, 'source/source.ts'), 'utf8')).toBe('edited');
  expect(fs.statSync(path.join(out, 'source/source.ts')).mode & 0o777).toBe(0o755);
  expect(fs.readlinkSync(path.join(out, 'source/link'))).toBe('source.ts');
  expect(result.tests).toContain('extra.test.ts');
  expect(capture(dir).sourceId).toBe(before.sourceId);
});
test('excludes even tracked secret fixtures and generated outputs', () => {
  const dir = tree();
  for (const name of ['private.key', 'next-env.d.ts']) fs.writeFileSync(path.join(dir, name), 'excluded');
  const result = capture(dir, path.join(dir, 'baseline-results/s0'));
  expect(result.entries.map(e => e.path)).toEqual(['source.ts']);
  expect(result.excluded.map(e => e.path)).toContain('.env.secret');
  expect(fs.existsSync(path.join(dir, 'baseline-results/s0/source/.env.secret'))).toBe(false);
  expect(fs.readFileSync(path.join(dir, 'baseline-results/s0/tracked.patch'), 'utf8')).not.toContain('DO NOT CAPTURE');
});
test('a source edit changes identity', () => {
  const dir = tree(); const before = capture(dir).sourceId;
  fs.writeFileSync(path.join(dir, 'source.ts'), 'different');
  expect(capture(dir).sourceId).not.toBe(before);
});
test('includes schema migrations but excludes database dumps', () => {
  const dir = tree();
  fs.mkdirSync(path.join(dir, 'prisma/migrations/001'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'prisma/migrations/001/migration.sql'), 'CREATE TABLE fixture(id int);');
  fs.writeFileSync(path.join(dir, 'private-dump.sql'), 'not source');
  const result = capture(dir);
  expect(result.entries.map(e => e.path)).toContain('prisma/migrations/001/migration.sql');
  expect(result.entries.map(e => e.path)).not.toContain('private-dump.sql');
});
test('refuses an escaping symlink', () => {
  const dir = tree(); fs.symlinkSync('../outside-secret', path.join(dir, 'escape'));
  expect(() => capture(dir)).toThrow('Escaping symlink');
});
test('succession fixture requires Imp, a legal Minion and CHEF or MONK before commit', () => {
  const candidate = (roles: string[]) => ({ assignments: roles.map(trueCharacterId => ({ trueCharacterId })) });
  expect(hasSuccessionPrerequisites(candidate(['IMP', 'SPY', 'CHEF']))).toBe(true);
  expect(hasSuccessionPrerequisites(candidate(['IMP', 'BARON', 'MONK']))).toBe(true);
  for (const roles of [['SPY', 'CHEF'], ['IMP', 'CHEF'], ['IMP', 'SPY']]) {
    expect(hasSuccessionPrerequisites(candidate(roles))).toBe(false);
  }
});
test('same seed and seats have identical role specimens despite different player UUIDs', () => {
  const candidate = (prefix: string, seed: string) => generateSetupCandidate({
    players: Array.from({ length: 13 }, (_, virtualSeat) => ({ playerId: `${prefix}-${virtualSeat}`, virtualSeat, participantKind: 'NORMAL' as const })),
    rng: new SeededRngV2(seed),
  });
  expect(scenarioSpecimen('baseline', candidate('first', 'baseline'))).toEqual(scenarioSpecimen('baseline', candidate('second', 'baseline')));
  expect(scenarioSpecimen('other', candidate('first', 'other'))).not.toEqual(scenarioSpecimen('baseline', candidate('first', 'baseline')));
});
test('command failures retain HTTP/domain/version evidence and successful versions propagate', async () => {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.statusCode = req.url === '/conflict' ? 409 : 200;
    res.end(req.url === '/conflict' ? JSON.stringify({ error: { code: 'VERSION_CONFLICT', actualVersion: 9 } }) : JSON.stringify({ version: 8 }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const context = await request.newContext({ baseURL: `http://127.0.0.1:${address.port}` });
  try {
    await expect(commandVersion(await context.post('/conflict'), 7)).rejects.toThrow(/expectedVersion=7: HTTP 409.*VERSION_CONFLICT.*actualVersion.*9/);
    expect(await commandVersion(await context.post('/ok'), 7)).toBe(8);
  } finally {
    await context.dispose();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
test('failed checks do not short-circuit independent stages, but build dependencies stay blocked', async () => {
  const dir = tree(); const out = path.join(dir, 'baseline-results/run');
  const results = await runStages([
    { name: 'unit', command: process.execPath, args: ['-e', 'process.exit(1)'] },
    { name: 'build', command: process.execPath, args: ['-e', 'process.exit(2)'] },
    { name: 'browser-production', command: process.execPath, args: ['-e', 'process.exit(0)'], requires: ['build'] },
    { name: 'browser-development', command: process.execPath, args: ['-e', 'process.exit(0)'] },
  ], dir, process.env, out);
  expect(results.map(r => r.status)).toEqual(['failed', 'failed', 'blocked', 'passed']);
  expect(JSON.parse(fs.readFileSync(path.join(out, 'stages.json'), 'utf8'))).toHaveLength(4);
});
test('missing or truncated reports cannot become a green inventory', () => {
  const dir = tree();
  expect(() => readInventories(dir)).toThrow('Missing or truncated native report');
  fs.writeFileSync(path.join(dir, 'unit.json'), '{');
  expect(() => readInventories(dir)).toThrow('Missing or truncated native report');
});
test('inventories preserve blocked browser identities and reject omitted unit outcomes', () => {
  const dir = tree();
  fs.writeFileSync(path.join(dir, 'unit-discovery.json'), JSON.stringify([{ file: 'test.ts', name: 'suite > case' }]));
  fs.writeFileSync(path.join(dir, 'unit.json'), JSON.stringify({ testResults: [{ name: 'test.ts', assertionResults: [{ ancestorTitles: ['suite'], title: 'case', status: 'passed', failureMessages: [] }] }] }));
  fs.writeFileSync(path.join(dir, 'browser-discovery.json'), JSON.stringify({ suites: [{ specs: [{ id: 'id', file: 'case.spec.ts', title: 'journey', tests: [{ projectName: 'mobile-chromium', expectedStatus: 'passed', results: [] }] }] }] }));
  expect(readInventories(dir, 'build failed').counts.browser.blocked).toBe(1);
  fs.writeFileSync(path.join(dir, 'unit.json'), JSON.stringify({ testResults: [] }));
  expect(() => readInventories(dir, 'build failed')).toThrow('Incomplete unit');
});
test('source verification refuses a changed specimen', () => {
  const dir = tree(); const manifest = capture(dir);
  expect(verifySource(manifest, dir)).toEqual([]);
  fs.writeFileSync(path.join(dir, 'source.ts'), 'mutated');
  expect(verifySource(manifest, dir)).toEqual(['source.ts']);
});
test.each(['added', 'removed', 'modified', 'mode', 'symlink', 'file-to-symlink'])('reconstructed source detects %s paths without Git', kind => {
  const dir = tree();
  fs.symlinkSync('source.ts', path.join(dir, 'link'));
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored-*.ts\n');
  const manifest = capture(dir, path.join(dir, 'baseline-results/capsule'));
  const work = path.join(dir, 'baseline-results/capsule/source');
  expect(fs.existsSync(path.join(work, '.git'))).toBe(false);
  expect(verifySource(manifest, work)).toEqual([]);
  let changed = 'source.ts';
  if (kind === 'added') { changed = 'ignored-added.test.ts'; fs.writeFileSync(path.join(work, changed), 'new test'); }
  if (kind === 'removed') fs.unlinkSync(path.join(work, changed));
  if (kind === 'modified') fs.writeFileSync(path.join(work, changed), 'changed');
  if (kind === 'mode') fs.chmodSync(path.join(work, changed), 0o755);
  if (kind === 'symlink') { changed = 'link'; fs.unlinkSync(path.join(work, changed)); fs.symlinkSync('.gitignore', path.join(work, changed)); }
  if (kind === 'file-to-symlink') { fs.unlinkSync(path.join(work, changed)); fs.symlinkSync('.gitignore', path.join(work, changed)); }
  expect(verifySource(manifest, work)).toEqual([changed]);
});
test('reconstructed source excludes declared generated outputs without reading them', () => {
  const dir = tree(); const manifest = capture(dir, path.join(dir, 'baseline-results/capsule'));
  const work = path.join(dir, 'baseline-results/capsule/source');
  fs.mkdirSync(path.join(work, 'node_modules'));
  fs.symlinkSync('/nonexistent/private', path.join(work, 'node_modules/link'));
  fs.writeFileSync(path.join(work, 'next-env.d.ts'), 'generated');
  expect(verifySource(manifest, work)).toEqual([]);
});
test('root tooling excludes retained capsules while still including current source', async () => {
  const parent = path.resolve('baseline-results'); fs.mkdirSync(parent, { recursive: true });
  const capsule = fs.mkdtempSync(path.join(parent, 'tooling-contract-')); trees.push(capsule);
  const file = path.join(capsule, 'source.ts'); fs.writeFileSync(file, 'const invalid: number = "capsule";');
  const ignored = execFileSync(process.execPath, ['--input-type=module', '-e',
    'import { ESLint } from "eslint"; const e = new ESLint(); console.log(JSON.stringify([await e.isPathIgnored(process.argv[1]), await e.isPathIgnored("src/lib/cn.ts")]));', file], { encoding: 'utf8' });
  expect(JSON.parse(ignored)).toEqual([true, false]);
  const ts = await import('typescript');
  const config = ts.readConfigFile(path.resolve('tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  expect(parsed.errors).toEqual([]);
  expect(parsed.fileNames).not.toContain(file);
  expect(parsed.fileNames).toContain(path.resolve('src/lib/cn.ts'));
});
test('occupied port is rejected without terminating its server', async () => {
  const server = createServer((_req, res) => res.end('unrelated'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  try {
    await expect(assertPortFree(address.port)).rejects.toThrow('occupied');
    expect(await (await fetch(`http://127.0.0.1:${address.port}`)).text()).toBe('unrelated');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('timed-out owned process is terminated and its partial report survives', async () => {
  const dir = tree();
  const results = await runStages([{ name: 'interrupted', command: process.execPath,
    args: ['-e', "console.log('partial evidence'); setInterval(() => {}, 1000)"], timeout: 200 }], dir, process.env, path.join(dir, 'baseline-results/run'));
  expect(results[0].status).toBe('failed');
  expect(results[0].signal).toBeTruthy();
  expect(fs.readFileSync(path.join(dir, 'baseline-results/run/interrupted.log'), 'utf8')).toContain('partial evidence');
});
test('deadline fails a graceful zero exit, persists the reason and only blocks dependents', async () => {
  const dir = tree(); const out = path.join(dir, 'baseline-results/run');
  const results = await runStages([
    { name: 'deadline', command: process.execPath, args: ['-e', "process.on('SIGTERM', () => { console.log('graceful shutdown'); process.exit(0); }); setInterval(() => {}, 1000)"], timeout: 500 },
    { name: 'dependent', command: process.execPath, args: ['-e', 'process.exit(0)'], requires: ['deadline'] },
    { name: 'independent', command: process.execPath, args: ['-e', 'process.exit(0)'] },
  ], dir, process.env, out);
  expect(results.map(r => r.status)).toEqual(['failed', 'blocked', 'passed']);
  expect(results[0]).toMatchObject({ exit: 0, reason: 'timeout after 500ms' });
  expect(JSON.parse(fs.readFileSync(path.join(out, 'stages.json'), 'utf8'))).toEqual(results);
  expect(fs.readFileSync(path.join(out, 'deadline.log'), 'utf8')).toContain('graceful shutdown');
});
