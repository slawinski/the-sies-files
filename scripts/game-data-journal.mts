import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const c = fs.constants;
const uid = () => process.getuid!();
const fail = () => { throw new Error('Private filesystem custody refused'); };

// Custody excludes hostile processes running as this same OS user. Every
// ancestor is checked, not just realpath's resolved destination.
export function privatePath(file: string) {
  if (!path.isAbsolute(file) || path.normalize(file) !== file) fail();
  const parent = path.dirname(file);
  for (let dir = parent; ; dir = path.dirname(dir)) {
    const st = fs.lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) fail();
    const trustedSystemTemp = st.uid === 0 && (st.mode & 0o1000) !== 0;
    if ((st.uid !== uid() && st.uid !== 0) || ((st.mode & 0o022) && !trustedSystemTemp)) fail();
    if (dir === parent && (st.uid !== uid() || (st.mode & 0o077))) fail();
    if (dir === path.dirname(dir)) break;
  }
  const st = fs.lstatSync(file, { throwIfNoEntry: false });
  if (st && (!st.isFile() || st.isSymbolicLink() || st.uid !== uid() || (st.mode & 0o077) || st.nlink !== 1)) fail();
  return file;
}
export function syncDirectory(file: string) {
  privatePath(file);
  const fd = fs.openSync(path.dirname(file), c.O_RDONLY | c.O_DIRECTORY | c.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
export function writePrivate(file: string, value: unknown) {
  privatePath(file);
  const fd = fs.openSync(file, c.O_WRONLY | c.O_CREAT | c.O_EXCL | c.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  syncDirectory(file);
}
export function readPrivate(file: string): unknown {
  privatePath(file);
  const fd = fs.openSync(file, c.O_RDONLY | c.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== uid() || (st.mode & 0o077) || st.nlink !== 1 || st.size > 1024 * 1024) fail();
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally { fs.closeSync(fd); }
}
export type FileStage = 'pending-file' | 'pending-directory' | 'final-file' | 'final-rename' | 'final-directory';
export type FileHook = (stage: FileStage) => void;
export function pending(file: string, value: unknown, hook?: FileHook) {
  hook?.('pending-file');
  writePrivate(file, value);
  hook?.('pending-directory');
  syncDirectory(file);
}
// Reserve the destination exclusively. Only this intent's reservation may be
// replaced by rename, including after a crash; unrelated files are never replaced.
export function finalize(file: string, value: unknown, intentDigest: string, hook?: FileHook) {
  privatePath(file);
  const reservation = { format: 'game-retirement-reservation/1', intentDigest };
  let replace: unknown = reservation;
  if (fs.existsSync(file)) {
    const existing = readPrivate(file);
    if (JSON.stringify(existing) === JSON.stringify(value)) { syncDirectory(file); return; }
    // A rename may have succeeded before directory sync failed. An exact old
    // receipt with no recorded failure is ours, not an unrelated collision.
    const beforeFailure = { ...(value as Record<string, unknown>), firstFailure: null };
    if (JSON.stringify(existing) === JSON.stringify(beforeFailure)) replace = existing;
    else if (JSON.stringify(existing) !== JSON.stringify(reservation)) fail();
  } else writePrivate(file, reservation);
  const temp = file + '.tmp-' + randomUUID();
  hook?.('final-file');
  writePrivate(temp, value);
  hook?.('final-rename');
  privatePath(file);
  if (JSON.stringify(readPrivate(file)) !== JSON.stringify(replace)) fail();
  fs.renameSync(temp, file);
  hook?.('final-directory');
  syncDirectory(file);
}
