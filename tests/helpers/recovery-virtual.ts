import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import * as crypto from 'node:crypto';
import ts from 'typescript';

type Mode = 'recorded' | 'standalone';
export type Mutation = 'none' | 'artifact' | 'missing-artifact' | 'unreadable-artifact' | 'source' | 'test' | 'lock' | 'schema' | 'migration' | 'checkout';
type Report = {
  complete: boolean; failure?: string; failureStage?: string;
  fingerprint?: { complete: boolean; failure?: string };
  cleanup: { complete: boolean; failed: string[] };
  build: ReturnType<typeof import('../../scripts/playable-recovery.mjs').buildIdentity>;
};

// Load the entire current modules, not copied orchestrator fragments. Only OS
// boundaries are virtual: real capture/verifySource/buildIdentity and lifecycle
// control flow run, with no database, process, port or checkout writes.
export async function virtualRecovery(mode: Mode, mutation: Mutation, dumpFailure = false) {
  const root = '/virtual/work', out = '/virtual/reports/run';
  const work = mode === 'recorded' ? root : out + '/capsule/source';
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const unreadable = new Set<string>();
  const events: string[] = [];
  const mkdir = (p: string) => { for (let d = p; d !== '/'; d = path.dirname(d)) dirs.add(d); };
  const write = (p: string, data: string | Buffer) => { mkdir(path.dirname(p)); files.set(p, data.toString()); };
  const fixture = {
    'package-lock.json': 'lock', 'prisma/schema.prisma': 'schema',
    'prisma/migrations/one/migration.sql': 'migration', 'src/game.ts': 'source',
    'tests/game.test.ts': 'test', 'scripts/regression-baseline.mts': 'observer',
  };
  for (const [name, data] of Object.entries(fixture)) write(root + '/' + name, data);
  const build = (cwd: string) => { write(cwd + '/.next/BUILD_ID', 'build-id'); write(cwd + '/.next/server/app.js', 'compiled'); };
  const read = (p: string, encoding?: string) => {
    if (unreadable.has(p) || !files.has(p)) throw new Error('private-secret-row: unreadable ' + p);
    const data = files.get(p)!;
    return encoding ? data : Buffer.from(data);
  };
  const fakeFs = {
    existsSync: (p: string) => files.has(p) || dirs.has(p), realpathSync: (p: string) => p,
    readFileSync: read,
    readdirSync: (p: string) => {
      if (!dirs.has(p)) throw new Error('missing directory');
      return [...new Set([...files.keys(), ...dirs].filter(n => n.startsWith(p + '/')).map(n => n.slice(p.length + 1).split('/')[0]))];
    },
    lstatSync: (p: string, options?: { throwIfNoEntry: boolean }) => {
      if (!files.has(p) && !dirs.has(p) && options?.throwIfNoEntry === false) return undefined;
      return { mode: 0o644, isDirectory: () => dirs.has(p), isFile: () => files.has(p), isSymbolicLink: () => false };
    },
    statSync: (p: string) => ({ isDirectory: () => dirs.has(p) }),
    mkdirSync: mkdir, mkdtempSync: () => { mkdir('/virtual/private'); return '/virtual/private'; },
    chmodSync() {}, writeFileSync: write,
    rmSync: (p: string) => { events.push('remove-private'); for (const n of files.keys()) if (n.startsWith(p + '/')) files.delete(n); dirs.delete(p); },
  };
  class Child extends EventEmitter {
    pid: number; exitCode: number | null = null; signalCode: string | null = null;
    constructor(pid: number) { super(); this.pid = pid; }
  }
  const children = new Map<number, Child>();
  let pid = 100;
  let appStarts = 0;
  let targetAppPid: number | undefined;
  let connect: (c: EventEmitter) => void;
  const request = (action: string, extra = {}) => new Promise((resolve, reject) => {
    const c = Object.assign(new EventEmitter(), { setTimeout() {}, destroy() {}, end(text: string) {
      const response = JSON.parse(text);
      if (response.error) reject(new Error(response.error));
      else resolve(response.value);
    } });
    connect(c); c.emit('data', JSON.stringify({ action, token: 'token', ...extra }) + '\n');
  });
  const mutate = () => {
    events.push('late-mutation');
    const names = { artifact: '.next/server/app.js', 'missing-artifact': '.next/server/app.js', 'unreadable-artifact': '.next/server/app.js',
      source: 'src/game.ts', test: 'tests/game.test.ts', lock: 'package-lock.json', schema: 'prisma/schema.prisma', migration: 'prisma/migrations/one/migration.sql', checkout: 'src/game.ts', none: '' };
    if (mutation === 'none') return;
    const p = (mutation === 'checkout' ? root : work) + '/' + names[mutation];
    if (mutation === 'missing-artifact') files.delete(p);
    else if (mutation === 'unreadable-artifact') unreadable.add(p);
    else write(p, 'changed');
  };
  const tools = {
    spawnSync(exe: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
      if (exe === 'git') return { status: 0, stdout: args[0] === 'ls-files' && !args.includes('--ignored') ? Object.keys(fixture).join('\0') : args[0] === 'rev-parse' ? 'head' : '' };
      if (exe === 'npm' && args.includes('build')) build(options.cwd);
      if ((exe === 'createdb' || exe === 'dropdb') && !args.includes('--version')) events.push(exe + ':' + args.at(-1));
      if (exe === 'pg_dump' && dumpFailure && !args.includes('--version')) { mutate(); return { status: 1, stdout: '' }; }
      if (exe === 'npx' && args.includes('--list')) write(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE!, JSON.stringify({ specs: [{ id: 'recovery-case' }] }));
      return { status: 0, stdout: args.includes('--version') ? `${exe} (PostgreSQL) 16.15` : exe === 'psql' ? '160015' : '' };
    },
    spawn(exe: string) {
      const c = new Child(++pid); children.set(c.pid, c);
      if (exe !== 'npx' && ++appStarts === 2) targetAppPid = c.pid;
      if (exe === 'npx') setImmediate(async () => {
        let passed = false;
        try {
          await request('start-source'); await request('restore-target'); await request('start-target');
          await request('complete', { claims: Object.fromEntries(['archiveRestoration', 'durableRows', 'runtimeProjections', 'persistedSessions', 'duplicateEffectFree', 'legalContinuation'].map(k => [k, true])) });
          passed = true;
        } catch { /* The failed native inventory mirrors the rejected IPC request. */ }
        write('/virtual/private/native.json', JSON.stringify({ specs: [{ id: 'recovery-case', tests: [{ results: [{ status: passed ? 'passed' : 'failed' }] }] }] }));
        events.push('worker-complete'); c.exitCode = passed ? 0 : 1; c.emit('close', c.exitCode);
      });
      return c;
    },
  };
  const fakeProcess = Object.assign(new EventEmitter(), {
    argv: [], env: {}, execPath: '/virtual/node', version: process.version, cwd: () => root,
    kill(group: number, signal: string) {
      const c = children.get(-group);
      if (!c || c.signalCode) throw new Error('group gone');
      events.push('stop:' + c.pid);
      // Drift during final app shutdown also proves the check follows shutdown,
      // not merely the worker completion handshake.
      if (c.pid === targetAppPid && !dumpFailure) mutate();
      c.signalCode = signal; c.emit('close', null);
    },
  });
  const cache = new Map<string, Record<string, unknown>>();
  const require = createRequire(import.meta.url);
  const load = (name: string): Record<string, unknown> => {
    if (cache.has(name)) return cache.get(name)!;
    const exports = {}; cache.set(name, exports);
    const filename = path.join(process.cwd(), 'scripts', name + '.mts');
    const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.url', JSON.stringify('file://' + root + '/scripts/' + name + '.mts'));
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    vm.runInNewContext('(async () => {\n' + compiled + '\n})()', {
      exports, Buffer, URL, process: fakeProcess, AbortSignal, console,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms === 5000 ? 0 : ms), clearTimeout,
      fetch: async () => ({ ok: true }),
      require(id: string) {
        if (id === 'node:fs') return fakeFs;
        if (id === 'node:child_process') return tools;
        if (id === 'node:crypto') return { ...crypto, randomUUID: () => 'token' };
        if (id === 'node:net') return { createServer(fn: typeof connect) { connect = fn; return { once() {}, listen(_p: string, cb: () => void) { cb(); }, close() { events.push('close-ipc'); } }; } };
        if (id === './test-database.mjs') return {
          resolveTarget: (env = { DATABASE_URL: 'postgresql://u@127.0.0.1:1/base_test' }) => ({ database: new URL(env.DATABASE_URL).pathname.slice(1), env, public: {} }),
          acquireLease: () => ({ token: 'lease', release() { events.push('release-lease'); } }), assertLease() {},
        };
        if (id === './regression-baseline.mjs') return { ...load('regression-baseline'), assertPortFree: async () => {} };
        if (id === './playable-recovery.mjs') return load('playable-recovery');
        if (id === './command-receipt-compatibility.mjs') return load('command-receipt-compatibility');
        return require(id);
      },
    }, { filename });
    return exports;
  };
  const recovery = load('playable-recovery') as typeof import('../../scripts/playable-recovery.mjs');
  if (mode === 'recorded') {
    build(root);
    const baseline = load('regression-baseline') as typeof import('../../scripts/regression-baseline.mjs');
    const manifest = baseline.capture(root);
    write('/virtual/baseline/capsule/manifest.json', JSON.stringify(manifest));
    write('/virtual/baseline/run.json', JSON.stringify({ runId: 'baseline', build: recovery.buildIdentity(root, manifest.sourceId) }));
  }
  const passed = await recovery.proveRecovery({ output: out, ...(mode === 'recorded' ? { buildRecord: '/virtual/baseline/run.json' } : {}) });
  const report = JSON.parse(files.get(out + '/recovery.json')!) as Report;
  return { passed, report, events, liveChildren: [...children.values()].filter(c => c.exitCode === null && c.signalCode === null).length,
    privateFiles: [...files.keys()].filter(p => p.startsWith('/virtual/private/')), serialized: JSON.stringify(report) };
}
