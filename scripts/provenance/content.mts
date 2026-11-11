import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { digest, excluded, readBytes, relative, safePath, sha256, sourceRoot } from './safe-files.mjs';

export const policy = {
  roots: ['.github', '.notebook', 'assets', 'docs', 'prisma', 'provenance', 'public', 'scripts', 'src', 'tests', 'the-sies-files-audit', 'the-sies-files-docs', 'the-sies-files-ux-audit'],
  files: ['.gitignore', 'README.md', 'package.json', 'package-lock.json', 'eslint.config.mjs', 'next.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'vitest.config.mts', 'playwright.config.ts', 'playwright.recovery.config.ts', 'playwright.security.config.ts'],
  selfReferences: ['provenance/content-ledger.json', 'provenance/dependency-index.json'],
  selfReferenceRule: 'Serialized ledger/index bytes excluded from membership hashes; explicit schema and report digests cover these artifacts. No hash fixed point.',
};
type Evidence = { recordId: string; custodian: string; reference: string; reviewRecord: string; membershipDigest: string; intendedUse: string; revision: string };
type Member = { path: string; sha256: string | null };
type Entry = { id: string; sourceSupplier: string; claimedCreator: string; importReference: string; derivation: string; intendedUse: string; distribution: { repository: string; staticDelivery: string; inGame: string }; noticeReferences: string[]; permission: { status: string; evidence?: Evidence }; files: Member[]; membershipDigest: string };
export type Ledger = { schema: number; policy: typeof policy; observations: typeof observations; entries: Entry[] };
const unknown = 'OWNER_EVIDENCE_REQUIRED';
const observations = {
  visibility: 'Public repository (owner/research metadata); package private flag restricts package publishing, not repository visibility. Local-only app execution is separate.',
  importHistory: 'Git account/import history identifies entry points, not authorship, assignment or permission.',
  art: [
    { input: 'assets/maps/sieski/the-sies-files-map-base.png', output: 'public/maps/sieski/map-base-029178c4b18a.webp', delivery: 'public static', script: 'scripts/build-map-assets.mjs' },
    { input: 'assets/maps/sieski/the-sies-files-map-west-reveal.png', output: 'assets/maps/sieski/map-west-reveal-3c1b1cdf7268.webp', delivery: 'protected authorized API; not public static', script: 'scripts/build-map-assets.mjs' },
  ],
  derivationLimits: 'Source/master and master-to-input derivations unproven. Script documents PNG-to-WebP mapping, not pixel reproduction. Filename suffix hashes textual shasum output; member SHA-256 hashes raw bytes independently.',
  fonts: 'globals.css system sans/monospace stacks; layout.tsx has no font loader. No observed font binaries. System font names do not establish redistribution.',
  readiness: 'productionReady: false remains independent of permission; WEST_AREA path and API authorization unchanged.',
};
export function discover(root: string) {
  sourceRoot(root); const names: string[] = [];
  const visit = (dir: string) => {
    const location = dir ? safePath(root, dir) : root;
    for (const child of fs.readdirSync(location).sort()) {
      const name = dir ? `${dir}/${child}` : child;
      if (excluded(name)) continue;
      if (!dir && !policy.roots.includes(child) && !policy.files.includes(child)) throw new Error(`Unknown root: ${child}`);
      const file = safePath(root, name); const stat = fs.lstatSync(file);
      if (stat.isDirectory()) {
        if (!dir && !policy.roots.includes(child)) throw new Error('Unexpected root directory');
        visit(name);
      } else names.push(name);
    }
  };
  visit(''); return names.sort();
}
function owner(name: string) {
  if (name === 'src/app/globals.css' || name === 'src/app/layout.tsx') return 'fonts-and-layout';
  if (name.startsWith('src/modules/trouble-brewing/')) return 'rules-names-prose';
  if (/^src\/(modules\/scenario|i18n|lib\/presentation)\//.test(name)) return 'scenario-localization';
  if (name.endsWith('.webp')) return 'runtime-derivatives';
  if (name.startsWith('assets/')) return 'authoring-art';
  if (/\.(png|jpe?g)$/i.test(name)) return 'reference-images';
  if (/\.(svg|ico)$/i.test(name)) return 'vectors-favicon';
  if (name.startsWith('the-sies-files-')) return 'inherited-specs-audits';
  return 'repository-code-text';
}
export function refreshContent(root: string, previous?: Ledger): Ledger {
  const groups = new Map<string, Member[]>();
  for (const name of discover(root)) {
    const files = groups.get(owner(name)) ?? [];
    files.push({ path: name, sha256: policy.selfReferences.includes(name) ? null : sha256(readBytes(root, name)) });
    groups.set(owner(name), files);
  }
  const entries = [...groups].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([id, files]): Entry => {
    const membershipDigest = digest(files); const old = previous?.entries.find(e => e.id === id);
    if (old?.permission.status === 'verified' && old.membershipDigest !== membershipDigest) throw new Error('Cannot expand or refresh verified evidence scope');
    if (old) return { ...old, id, files, membershipDigest };
    return { id, sourceSupplier: unknown, claimedCreator: unknown, importReference: unknown, derivation: unknown,
      intendedUse: 'Local playable application and publicly visible repository; future distribution intent requires owner evidence',
      distribution: { repository: 'public source visibility; not a grant', staticDelivery: id === 'runtime-derivatives' ? 'base public; west protected outside public/' : 'Public placement is potential static delivery, not proof of runtime use', inGame: 'Authorization and use determined by application; not a permission grant' },
      noticeReferences: [], permission: { status: unknown }, files, membershipDigest };
  });
  return { schema: 1, policy, observations, entries };
}
export function validateContent(root: string, ledger: Ledger) {
  const errors: string[] = []; const gaps: string[] = [];
  try {
    if (ledger.schema !== 1 || digest(ledger.policy) !== digest(policy) || digest(ledger.observations) !== digest(observations) || !Array.isArray(ledger.entries) || !ledger.entries.length) throw new Error('Invalid ledger schema/policy');
    const discovered = new Set(discover(root)); const seen = new Set<string>(); const groups = new Set<string>();
    for (const entry of ledger.entries) {
      if (!entry.id || groups.has(entry.id) || !entry.files?.length) errors.push('duplicate or empty primary group');
      groups.add(entry.id);
      for (const field of ['sourceSupplier', 'claimedCreator', 'importReference', 'derivation', 'intendedUse'] as const) if (!entry[field]?.trim()) errors.push(`Missing ${field}`);
      if (!entry.distribution?.repository || !entry.distribution.staticDelivery || !entry.distribution.inGame || !Array.isArray(entry.noticeReferences)) errors.push('Missing distribution/notice metadata');
      for (const file of entry.files) {
        relative(file.path);
        if (excluded(file.path) || (!policy.roots.includes(file.path.split('/')[0]) && !policy.files.includes(file.path))) throw new Error('Unsafe or unknown ledger path');
        if (seen.has(file.path)) errors.push(`duplicate ownership: ${file.path}`);
        seen.add(file.path);
        if (!discovered.delete(file.path)) errors.push(`Missing or duplicate file: ${file.path}`);
        if (owner(file.path) !== entry.id) errors.push(`Wrong primary category: ${file.path}`);
        if (policy.selfReferences.includes(file.path)) { if (file.sha256 !== null) errors.push('Invalid self-reference'); }
        else if (sha256(readBytes(root, file.path)) !== file.sha256) errors.push(`stale identity: ${file.path}`);
      }
      if (entry.membershipDigest !== digest(entry.files)) errors.push('stale membership digest');
      if (entry.permission?.status === 'verified') {
        const evidence = entry.permission.evidence;
        if (!evidence || !evidence.recordId || !evidence.custodian || !evidence.reviewRecord || evidence.membershipDigest !== digest(entry.files) || evidence.revision !== entry.membershipDigest || evidence.intendedUse !== entry.intendedUse) errors.push(`Unbound evidence: ${entry.id}`);
        else { relative(evidence.reference); if (/\.(pdf|docx?)$/i.test(evidence.reference)) errors.push('Use nonsensitive record pointer, not private agreement'); }
      } else if (entry.permission?.status !== unknown) errors.push('Invalid permission status');
      else gaps.push(`${entry.id}: ${unknown}; source, creator, assignment/grant, covered uses and notice obligations`);
    }
    for (const name of discovered) errors.push(`uncovered file: ${name}`);
  } catch (error) { errors.push((error as Error).message); }
  // Metadata validation cannot prove the truth or legal sufficiency of any record.
  gaps.push('Owner/legal assessment and actual distribution obligations not established by technical metadata validation');
  return { valid: errors.length === 0, errors, permissionState: 'permission_not_established' as const, gaps };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = sourceRoot(process.cwd());
  const name = 'provenance/content-ledger.json';
  if (process.argv[2] === 'refresh') {
    fs.mkdirSync(safePath(root, 'provenance', true), { recursive: true });
    const previous = fs.existsSync(path.join(root, name)) ? JSON.parse(readBytes(root, name).toString('utf8')) : undefined;
    // Include the artifact's membership from the first generation onward.
    if (!previous) fs.writeFileSync(safePath(root, name, true), '{}\n');
    fs.writeFileSync(safePath(root, name), JSON.stringify(refreshContent(root, previous), null, 2) + '\n');
  } else if (process.argv[2] !== 'check') throw new Error('Use refresh or check');
  const result = validateContent(root, JSON.parse(readBytes(root, name).toString('utf8')));
  console.log(JSON.stringify(result)); process.exitCode = result.valid ? 0 : 1;
}
