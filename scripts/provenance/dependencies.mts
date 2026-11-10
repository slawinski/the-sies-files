import { digest, relative } from './safe-files.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readText, safePath, serialize } from './safe-files.mjs';

type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
type Locked = { name?: string; version?: string; resolved?: string; integrity?: string; license?: string; dev?: boolean; devOptional?: boolean; optional?: boolean; hasInstallScript?: boolean; inBundle?: boolean; os?: string[]; cpu?: string[]; libc?: string[]; engines?: Record<string, string>; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; link?: boolean };
type Lock = { lockfileVersion: number; packages: Record<string, Locked> };
export function packageName(key: string) {
  relative(key);
  if (!/^node_modules\/(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+(?:\/node_modules\/(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+)*$/.test(key)) throw new Error('Unsafe package key');
  return key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
}
export function dependencyIndex(manifest: Manifest, lock: Lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages || !Object.hasOwn(lock.packages, '')) throw new Error('Expected lockfile v3 packages');
  const candidates = Object.keys(lock.packages).filter(Boolean).sort().map(key => {
    const name = packageName(key); const value = lock.packages[key];
    if (!value || typeof value.version !== 'string' || !value.version || value.link) throw new Error('Unsupported locked identity');
    if (value.name && value.name !== name) throw new Error('Locked package name mismatch');
    if (value.resolved && !/^https:\/\//.test(value.resolved)) throw new Error('Nonportable package source');
    const direct = key === `node_modules/${name}`;
    return { path: key, name, version: value.version, resolved: value.resolved ?? null, integrity: value.integrity ?? null, declaredLicense: value.license ?? null,
      relationship: direct && (manifest.dependencies?.[name] || manifest.optionalDependencies?.[name]) ? 'direct-runtime-declaration' : direct && manifest.devDependencies?.[name] ? 'direct-development-declaration' : 'transitive',
      dev: value.dev === true, devOptional: value.devOptional === true, optional: value.optional === true, hasInstallScript: value.hasInstallScript === true, inBundle: value.inBundle === true,
      os: value.os ?? [], cpu: value.cpu ?? [], libc: value.libc ?? [], engines: value.engines ?? {}, dependencies: value.dependencies ?? {}, optionalDependencies: value.optionalDependencies ?? {}, peerDependencies: value.peerDependencies ?? {},
    };
  });
  return { schema: 1, manifestDigest: digest(manifest), lockDigest: digest(lock), interpretation: 'All non-root locked candidates; declared flags overlap. Not an installed list or shipped-binary composition. License metadata is not full notice evidence.', candidates };
}
export type DependencyIndex = ReturnType<typeof dependencyIndex>;
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const index = dependencyIndex(JSON.parse(readText(root, 'package.json').text), JSON.parse(readText(root, 'package-lock.json').text));
  if (process.argv[2] === 'refresh') fs.writeFileSync(safePath(root, 'provenance/dependency-index.json', true), serialize(index));
  else if (process.argv[2] !== 'check') throw new Error('Use refresh or check');
  if (readText(root, 'provenance/dependency-index.json', 8 * 1024 * 1024).text !== serialize(index)) throw new Error('Stale dependency index');
  console.log(JSON.stringify({ candidates: index.candidates.length, valid: true }));
}
