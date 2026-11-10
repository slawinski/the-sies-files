import fs from 'node:fs';
import path from 'node:path';
import { packageName, type DependencyIndex } from './dependencies.mjs';
import { excluded, readText, relative, safePath, sha256, sourceRoot } from './safe-files.mjs';

export const limits = { fileBytes: 2 * 1024 * 1024, packageBytes: 16 * 1024 * 1024, depth: 5, entries: 30000, bannerFiles: 8, bannerBytes: 64 * 1024 };
type Notice = { path: string; sha256: string; bytes: number; text: string; complete: true };
type Banner = { path: string; sourceSha256: string; text: string; sha256: string; interpretation: string };
type PackageObservation = { path: string; name: string; lockedVersion: string; status: 'not_observed_installed' | 'observed_matching' | 'identity_mismatch' | 'unsafe_or_incomplete'; complete: boolean; notices: Notice[]; banners: Banner[]; diagnostics: string[] };
// Package out/build directories are distributed inputs, not repository outputs.
const packageExcluded = (name: string) => excluded(name.split('/').map(p => ['out', 'build', 'dist'].includes(p) ? 'package-distribution' : p).join('/'));
export function collectNotices(root: string, index: DependencyIndex) {
  sourceRoot(root);
  const packages: PackageObservation[] = []; const gaps: string[] = [];
  for (const candidate of index.candidates) {
    // Revalidate even a caller-supplied/tampered index before accessing package bytes.
    if (packageName(candidate.path) !== candidate.name) throw new Error('Invalid candidate identity');
    const item: PackageObservation = { path: candidate.path, name: candidate.name, lockedVersion: candidate.version, status: 'not_observed_installed', complete: true, notices: [], banners: [], diagnostics: [] };
    packages.push(item);
    try {
      const location = safePath(root, candidate.path, true);
      if (!fs.existsSync(location)) continue;
      if (!fs.lstatSync(location).isDirectory()) throw new Error('Non-directory package');
      const installed = JSON.parse(readText(root, `${candidate.path}/package.json`).text);
      if (installed.name !== candidate.name || installed.version !== candidate.version) {
        item.status = 'identity_mismatch'; item.complete = false; item.diagnostics.push('Installed name/version does not match locked identity; no matching-release notice attribution'); continue;
      }
      item.status = 'observed_matching';
      let total = 0; let entries = 0;
      const visit = (dir: string, depth: number) => {
        for (const child of fs.readdirSync(safePath(root, dir)).sort()) {
          const name = `${dir}/${child}`;
          if (child === 'node_modules' || packageExcluded(child)) continue;
          if (++entries > limits.entries) throw new Error('Package discovery limit; incomplete');
          const conventional = /^(licen[sc]e|notice|copying|copyright)(?:[._-].*)?$/i.test(child) && !/\.(?:[cm]?js|map|ts|tsx|json|node|png|svg)$/i.test(child);
          const full = safePath(root, name); const stat = fs.lstatSync(full);
          if (stat.isDirectory()) {
            if (conventional) throw new Error('Nonregular notice input');
            if (depth >= limits.depth) { item.diagnostics.push('Discovery depth bounded; deeper contents not inspected'); continue; }
            visit(name, depth + 1);
          } else if (conventional) {
            if (stat.size > limits.fileBytes || total + stat.size > limits.packageBytes) throw new Error('Notice text limit; incomplete');
            const read = readText(root, name, limits.fileBytes); total += read.bytes;
            item.notices.push({ path: name.slice(candidate.path.length + 1), ...read, complete: true });
          }
        }
      };
      visit(candidate.path, 0);
      // Only explicit distribution entry points: no recursive source-code export.
      const selected = [...new Set(['index.js', 'dist/index.js', 'dist/cjs/index.js', installed.main, installed.module].filter((v): v is string => typeof v === 'string'))].slice(0, limits.bannerFiles);
      for (let name of selected) {
        if (!name) continue;
        if (name.startsWith('./')) name = name.slice(2);
        if (name.endsWith('/')) name = name.slice(0, -1);
        relative(name); if (packageExcluded(name)) throw new Error('Unsafe banner entry');
        if (!/\.(mjs|cjs|js)$/.test(name)) { item.diagnostics.push('Selected non-JavaScript entry not inspected for embedded banners'); continue; }
        const file = `${candidate.path}/${name}`; const full = safePath(root, file, true);
        if (!fs.existsSync(full)) continue;
        if (fs.lstatSync(full).size > limits.fileBytes) { item.diagnostics.push('Selected banner source too large; not inspected'); continue; }
        const read = readText(root, file);
        for (const match of read.text.matchAll(/\/\*[!*][\s\S]*?\*\//g)) {
          if (!/copyright|licen[sc]e|permission/i.test(match[0])) continue;
          const size = Buffer.byteLength(match[0]);
          if (size > limits.bannerBytes || total + size > limits.packageBytes) throw new Error('Embedded banner exceeds limit; incomplete');
          total += size;
          item.banners.push({ path: name, sourceSha256: read.sha256, text: match[0], sha256: sha256(match[0]), interpretation: 'Bounded observed public license banner; not exhaustive embedded/binary notice coverage' });
        }
      }
      if (!item.notices.length) gaps.push(`${candidate.path}: No conventional notice text observed; review upstream/bundled notices`);
    } catch (error) {
      // Filesystem/decoder/JSON errors may contain workstation paths or input bytes.
      item.status = 'unsafe_or_incomplete'; item.complete = false;
      const message = error instanceof Error ? error.message : '';
      const safeReason = ['Unsafe relative path', 'Unsafe symlink', 'Nonregular file', 'Nonregular notice input', 'Non-directory package', 'Binary text', 'Oversized file', 'File changed during read', 'Notice text limit; incomplete', 'Embedded banner exceeds limit; incomplete', 'Package discovery limit; incomplete', 'Unsafe banner entry'].includes(message) ? message : error instanceof TypeError && 'code' in error && error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA' ? 'Invalid UTF-8' : error instanceof SyntaxError ? 'Malformed package metadata' : 'Unreadable or unsafe package input';
      item.diagnostics.push(`${safeReason}; collection incomplete`);
    }
  }
  gaps.push('Browser bundles, Prisma generated/native engines, sharp/libvips and upstream embedded notices are not exhaustively inventoried or legally assessed');
  return { schema: 1, valid: packages.every(p => p.complete), limits, packages, gaps, interpretation: 'Matching installed name/version is observed; lock integrity is declared metadata, not a local tarball-byte verification. Absence is not a failure or shipped classification.' };
}
export function observeTraces(root: string) {
  const observations: { manifest: string; sha256: string; paths: string[] }[] = []; const errors: string[] = [];
  // Only the selected .next build. Trace references are normalized against their
  // manifest, restricted to dependency/build metadata, and never read as content.
  for (const name of ['.next/next-server.js.nft.json', '.next/next-minimal-server.js.nft.json']) {
    try {
      const full = safePath(root, name, true); if (!fs.existsSync(full)) continue;
      const read = readText(root, name); const data = JSON.parse(read.text);
      if (data.version !== 1 || !Array.isArray(data.files) || data.files.length > 30000) throw new Error();
      const paths = data.files.map((file: unknown) => {
        if (typeof file !== 'string' || path.posix.isAbsolute(file) || file.includes('\\') || /^[A-Za-z]:/.test(file)) throw new Error();
        const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(name), file));
        relative(normalized);
        if (packageExcluded(normalized.split('/').map(p => p === 'node_modules' ? 'dependencies' : p === '.next' ? 'selected-build' : p).join('/')) || !/^(node_modules|\.next)\//.test(normalized)) throw new Error();
        safePath(root, normalized, true);
        return normalized;
      });
      observations.push({ manifest: name, sha256: read.sha256, paths: [...new Set<string>(paths)].sort() });
    } catch { errors.push('Unsafe or invalid selected trace; no referenced bytes copied'); }
  }
  return { valid: errors.length === 0, observations, errors, limitations: ['Only two selected server NFT manifests observed; absence/partial traces do not prove full distribution', 'No exhaustive browser, native/generated engine or libvips binary composition claim'] };
}
