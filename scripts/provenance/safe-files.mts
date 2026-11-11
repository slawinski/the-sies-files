import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export const serialize = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
export const digest = (value: unknown) => sha256(serialize(value));
export function relative(name: string) {
  if (typeof name !== 'string' || !name || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name) || path.posix.isAbsolute(name) || /^[A-Za-z]:/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe relative path');
  return name;
}
export function sourceRoot(root: string) {
  const resolved = path.resolve(root);
  for (let current = resolved; ; current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Unsafe symlink root');
    if (current === path.dirname(current)) break;
  }
  if (!fs.lstatSync(resolved).isDirectory()) throw new Error('Root is not a directory');
  return resolved;
}
export function safePath(root: string, name: string, missing = false) {
  relative(name);
  let current = sourceRoot(root);
  const parts = name.split('/');
  for (const [i, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat && missing) continue;
    if (!stat) throw new Error('Missing file');
    if (stat.isSymbolicLink()) throw new Error('Unsafe symlink');
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error('Non-directory parent');
    if (i === parts.length - 1 && !stat.isDirectory() && !stat.isFile()) throw new Error('Nonregular file');
  }
  return current;
}
export function readBytes(root: string, name: string, limit = Infinity) {
  const file = safePath(root, name); const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error('Nonregular file');
  if (stat.size > limit) throw new Error('Oversized file');
  // O_NOFOLLOW also refuses a last-component replacement between validation and open.
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.size > limit || opened.ino !== stat.ino || opened.dev !== stat.dev) throw new Error('File changed during read');
    let bytes: Buffer;
    if (Number.isFinite(limit)) {
      const buffer = Buffer.alloc(Math.min(opened.size + 1, limit + 1));
      let length = 0;
      while (length < buffer.length) {
        const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
        if (!count) break;
        length += count;
      }
      if (length !== opened.size) throw new Error('File changed during read');
      bytes = buffer.subarray(0, length);
    } else bytes = fs.readFileSync(fd);
    if (bytes.length > limit) throw new Error('Oversized file');
    return bytes;
  } finally { fs.closeSync(fd); }
}
export function readText(root: string, name: string, limit = 2 * 1024 * 1024) {
  const bytes = readBytes(root, name, limit);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('Binary text');
  return { text, sha256: sha256(bytes), bytes: bytes.length };
}
export const excluded = (name: string) => name.split('/').some(p => /^(\.git|node_modules|\.next|out|build|coverage|test-results|playwright-report|baseline-results|provenance-results|evidence|private-records|security-private|\.vercel|\.yarn)$/.test(p) || /^\.env/.test(p) || /\.(pem|key|p12|pfx|dump|tsbuildinfo)$/.test(p) || /^(id_rsa|id_ed25519|credentials.*|secrets?.*|next-env\.d\.ts|\.DS_Store)$/i.test(p)) || (/\.sql$/i.test(name) && !/^prisma\/migrations\/[^/]+\/migration\.sql$/.test(name));
