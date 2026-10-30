import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function resolveTarget(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const fail = () => { throw new Error('Explicit local disposable *_test DATABASE_URL required; conflicting URLs and connection overrides refused'); };
  try {
    const raw = env.DATABASE_URL ?? env.E2E_DATABASE_URL;
    if (!raw) return fail();
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.search || url.hash) return fail();
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!/^[a-z][a-z0-9_]*_test$/.test(database) || !url.username) return fail();
    if (env.DATABASE_URL && env.E2E_DATABASE_URL && new URL(env.DATABASE_URL).href !== new URL(env.E2E_DATABASE_URL).href) return fail();
    const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname.replace(/[\[\]]/g, '');
    const port = url.port || '5432';
    // Neither libpq nor Prisma may inherit a different connection target.
    const pg = { PGHOST: host, PGPORT: port, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: database };
    const childEnv: NodeJS.ProcessEnv = { ...env, NODE_ENV: env.NODE_ENV ?? 'test', ...pg, DATABASE_URL: raw, E2E_DATABASE_URL: raw };
    for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGHOSTADDR']) delete childEnv[key];
    return { database, key: `loopback:${port}/${database}`, public: { host, port, database },
      env: childEnv };
  } catch { return fail(); }
}
export type Target = ReturnType<typeof resolveTarget>;
const lockPath = (key: string) => path.join(os.tmpdir(), 'sies-baseline-' + createHash('sha256').update(key).digest('hex') + '.lock');
export function acquireLease(target: Target, port?: number) {
  const token = randomUUID();
  const paths = [lockPath(target.key), ...(port ? [lockPath(`port:${port}`)] : [])];
  const owned: string[] = [];
  try {
    for (const file of paths) {
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid })); fs.closeSync(fd); owned.push(file);
    }
  } catch { for (const file of owned) fs.unlinkSync(file); throw new Error('Disposable resource already owned; do not reset or kill its owner'); }
  return { token, release() {
    for (const file of owned) {
      if (JSON.parse(fs.readFileSync(file, 'utf8')).token !== token) throw new Error('Resource ownership changed');
      fs.unlinkSync(file);
    }
    owned.length = 0;
  } };
}
export function assertLease(target: Target, token = process.env.BASELINE_DB_LEASE) {
  try {
    const owner = JSON.parse(fs.readFileSync(lockPath(target.key), 'utf8'));
    if (!token || owner.token !== token) throw new Error();
    process.kill(owner.pid, 0);
  } catch { throw new Error('Disposable database ownership missing or expired'); }
}
export function run(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd()) {
  const r = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`Test resource stage failed: ${command} (exit ${r.status})`);
}
export function resetDatabase(target: Target, token?: string, cwd = process.cwd()) {
  assertLease(target, token);
  run('dropdb', ['--if-exists', target.database], target.env, cwd);
  run('createdb', [target.database], target.env, cwd);
  run('npx', ['prisma', 'migrate', 'deploy'], target.env, cwd);
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!['reset', 'verify'].includes(process.argv[2])) throw new Error('Use reset or verify');
  const target = resolveTarget();
  const lease = acquireLease(target);
  try {
    resetDatabase(target, lease.token);
    if (process.argv[2] === 'verify') run('npm', ['test'], { ...target.env, BASELINE_DB_LEASE: lease.token });
  } finally { lease.release(); }
}
