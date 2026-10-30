import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hash = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
function git(root: string, args: string[]) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('Cannot inventory Git source');
  return r.stdout;
}
export function excluded(name: string): boolean {
  return name.split('/').some(p => /^(\.git|node_modules|\.next|out|build|coverage|test-results|playwright-report|baseline-results|\.vercel|\.yarn)$/.test(p) || /^\.env/.test(p) || /\.(pem|key|p12|pfx|dump|sql|tsbuildinfo)$/.test(p) || /^(id_rsa|id_ed25519|credentials.*|secrets?.*|next-env\.d\.ts|\.DS_Store)$/i.test(p));
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
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , root, output] = process.argv;
  if (!root) throw new Error('Usage: node scripts/regression-baseline.mts SOURCE [NEW_CAPSULE]');
  if (output && fs.existsSync(output)) throw new Error('Capsule must not already exist');
  const m = capture(root, output);
  console.log(JSON.stringify({ sourceId: m.sourceId, files: m.entries.length, tests: m.tests.length }));
}
