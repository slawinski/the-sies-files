import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover, refreshContent, validateContent, type Ledger } from './provenance/content.mjs';
import { dependencyIndex } from './provenance/dependencies.mjs';
import { collectNotices, observeTraces } from './provenance/notices.mjs';
import { digest, readBytes, readText, relative, safePath, serialize, sha256, sourceRoot } from './provenance/safe-files.mjs';

const artifacts = ['notices.json', 'report.json'];
type Build = { sourceId: string; id: string; lockSha256: string; artifactSha256: string; schemaSha256: string; migrationsSha256: string };
type Options = { output: string; sourceId?: string; buildRecord?: string };
const json = (root: string, name: string, limit = 16 * 1024 * 1024) => JSON.parse(readText(root, name, limit).text);
function inputs(root: string) {
  const ledger: Ledger = json(root, 'provenance/content-ledger.json');
  const manifest = json(root, 'package.json'); const lock = json(root, 'package-lock.json');
  const index = dependencyIndex(manifest, lock);
  return { ledger, index, indexCurrent: readText(root, 'provenance/dependency-index.json', 16 * 1024 * 1024).text === serialize(index) };
}
export function refreshPortable(root: string) {
  sourceRoot(root); safePath(root, 'provenance', true);
  fs.mkdirSync(path.join(root, 'provenance'), { recursive: true });
  const ledgerName = 'provenance/content-ledger.json'; const indexName = 'provenance/dependency-index.json';
  const previous: Ledger | undefined = fs.existsSync(safePath(root, ledgerName, true)) ? json(root, ledgerName) : undefined;
  const index = dependencyIndex(json(root, 'package.json'), json(root, 'package-lock.json'));
  if (!previous) fs.writeFileSync(safePath(root, ledgerName, true), '{}\n');
  if (!fs.existsSync(safePath(root, indexName, true))) fs.writeFileSync(safePath(root, indexName, true), '{}\n');
  const ledger = refreshContent(root, previous);
  fs.writeFileSync(safePath(root, indexName), serialize(index));
  fs.writeFileSync(safePath(root, ledgerName), serialize(ledger));
}
function sourceIdentity(root: string) {
  const members = discover(root).map(name => [name, sha256(readBytes(root, name))]);
  return { fingerprint: digest(members), collectorDigest: digest(members.filter(([name]) => /^scripts\/provenance(?:\/|\.mts$)/.test(name))) };
}
// Same build identity contract as the physical recovery observer, without its
// database imports. Every path is checked before hashing; bytes are never exported.
export function selectedBuildIdentity(root: string, sourceId: string): Build {
  const members: [string, string][] = [];
  const visit = (dir: string) => {
    for (const name of fs.readdirSync(safePath(root, dir ? `.next/${dir}` : '.next')).sort()) {
      if (!dir && ['cache', 'diagnostics', 'trace', 'trace-build', 'dev', 'lock'].includes(name)) continue;
      const relative = dir ? `${dir}/${name}` : name;
      const file = safePath(root, `.next/${relative}`);
      if (fs.lstatSync(file).isDirectory()) visit(relative);
      else members.push([relative, sha256(readBytes(root, `.next/${relative}`))]);
    }
  };
  visit('');
  const migrations = fs.readdirSync(safePath(root, 'prisma/migrations')).sort()
    .filter(name => fs.lstatSync(safePath(root, `prisma/migrations/${name}`)).isDirectory())
    .filter(name => fs.existsSync(safePath(root, `prisma/migrations/${name}/migration.sql`, true)))
    .map(name => [name, sha256(readBytes(root, `prisma/migrations/${name}/migration.sql`))]);
  return { sourceId, id: readText(root, '.next/BUILD_ID').text.trim(), lockSha256: sha256(readBytes(root, 'package-lock.json')), artifactSha256: sha256(JSON.stringify(members)), schemaSha256: sha256(readBytes(root, 'prisma/schema.prisma')), migrationsSha256: sha256(JSON.stringify(migrations)) };
}
function outputRoot(root: string, options: Options) {
  sourceRoot(root);
  // Reject normalized-away traversal even when a future caller passes raw CLI text.
  if (options.output.split(/[\\/]/).some(p => p === '..') || options.output.includes('\\')) throw new Error('Unsafe output path');
  const output = path.resolve(options.output); const inside = path.relative(root, output).split(path.sep).join('/');
  if (!inside.startsWith('provenance-results/')) {
    if (!options.buildRecord || path.basename(options.buildRecord) !== 'run.json' || output !== path.join(path.dirname(path.resolve(options.buildRecord)), 'provenance') || root !== path.join(path.dirname(path.resolve(options.buildRecord)), 'capsule/source')) throw new Error('Output must be an excluded provenance-results child or selected canonical provenance directory');
  }
  // Validate every existing parent, including symlinks, before creating output.
  let ancestor = output;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  sourceRoot(ancestor);
  fs.mkdirSync(output, { recursive: true }); sourceRoot(output);
  if (fs.readdirSync(output).some(name => !artifacts.includes(name))) throw new Error('Unexpected artifact; refusing output directory');
  for (const name of fs.readdirSync(output)) safePath(output, name);
  return output;
}
function observedBuild(root: string, sourceId: string, record?: string) {
  if (!record) return null;
  const directory = sourceRoot(path.dirname(path.resolve(record)));
  const metadata = json(directory, path.basename(record));
  if (metadata.sourceId !== sourceId || metadata.build?.sourceId !== sourceId) throw new Error('Build/source identity mismatch');
  const actual = selectedBuildIdentity(root, sourceId);
  if (digest(actual) !== digest(metadata.build)) throw new Error('Selected build does not match recorded fingerprint');
  return actual;
}
export function checkProvenance(root: string, options: Options) {
  root = sourceRoot(root); const output = outputRoot(root, options);
  // An interrupted/failed new attempt must never leave an old success report.
  fs.writeFileSync(safePath(output, 'report.json', true), serialize({ schema: 1, complete: false, technicalValid: false, permissionState: 'permission_not_established', gaps: ['Owner evidence required; technical collection has not completed'] }));
  fs.writeFileSync(safePath(output, 'notices.json', true), serialize({ schema: 1, complete: false }));
  const before = sourceIdentity(root); const sourceId = options.sourceId ?? before.fingerprint;
  if (!/^[a-f0-9]{64}$/.test(sourceId)) throw new Error('Invalid source identity');
  const { ledger, index, indexCurrent } = inputs(root);
  const content = validateContent(root, ledger);
  const notices = collectNotices(root, index);
  const traces = options.buildRecord ? observeTraces(root) : { valid: true, observations: [], errors: [], limitations: ['No selected build; no distribution evidence collected'] };
  let build: Build | null = null; const errors: string[] = [];
  try { build = observedBuild(root, sourceId, options.buildRecord); } catch { errors.push('Source/build identity mismatch; release attribution refused'); }
  if (!indexCurrent) errors.push('Stale dependency index; check does not refresh');
  if (sourceIdentity(root).fingerprint !== before.fingerprint) errors.push('Source changed during provenance collection');
  const valid = content.valid && indexCurrent && notices.valid && traces.valid && !errors.length;
  const bundle = { sourceId, sourceFingerprint: before.fingerprint, ...notices };
  fs.writeFileSync(safePath(output, 'notices.json', true), serialize(bundle));
  const body = { schema: 1, complete: valid, technicalValid: valid, permissionState: 'permission_not_established', sourceId,
    sourceFingerprint: before.fingerprint, collectorDigest: before.collectorDigest,
    ledgerDigest: sha256(readBytes(root, 'provenance/content-ledger.json')), indexDigest: sha256(readBytes(root, 'provenance/dependency-index.json')), lockDigest: sha256(readBytes(root, 'package-lock.json')),
    build, content, dependency: { valid: indexCurrent, candidateCount: index.candidates.length, observedCount: notices.packages.filter(p => p.status === 'observed_matching').length, notObservedCount: notices.packages.filter(p => p.status === 'not_observed_installed').length, collectionValid: notices.valid },
    traces, errors, gaps: [...content.gaps, ...notices.gaps, ...traces.limitations],
    artifacts: [{ path: 'notices.json', sha256: sha256(readBytes(output, 'notices.json')) }],
    limitations: ['Technical inventory and evidence integrity only; no legal truth, clearance, SPDX compatibility or exhaustive shipped-component claim', 'Public upstream notice texts and bounded banners only; no source images, private records, environment or session bytes'],
  };
  const report = { ...body, reportDigest: digest(body) };
  fs.writeFileSync(safePath(output, 'report.json', true), serialize(report));
  return report;
}
export function readProvenanceReport(output: string, root: string, sourceId: string, expectedBuild?: Build) {
  sourceRoot(output); sourceRoot(root);
  if (digest(fs.readdirSync(output).sort()) !== digest(artifacts)) throw new Error('Unexpected or missing provenance artifacts');
  const report = json(output, 'report.json'); const { reportDigest, ...body } = report;
  const expectedKeys = ['schema', 'complete', 'technicalValid', 'permissionState', 'sourceId', 'sourceFingerprint', 'collectorDigest', 'ledgerDigest', 'indexDigest', 'lockDigest', 'build', 'content', 'dependency', 'traces', 'errors', 'gaps', 'artifacts', 'limitations', 'reportDigest'].sort();
  if (digest(Object.keys(report).sort()) !== digest(expectedKeys)) throw new Error('Unknown or missing report section');
  const identity = sourceIdentity(root); const { ledger, index, indexCurrent } = inputs(root);
  const content = validateContent(root, ledger);
  if (report.schema !== 1 || reportDigest !== digest(body) || report.complete !== true || report.technicalValid !== true || report.permissionState !== 'permission_not_established' || !Array.isArray(report.gaps) || !report.gaps.length || !Array.isArray(report.limitations) || !report.limitations.length || report.sourceId !== sourceId || report.sourceFingerprint !== identity.fingerprint || report.collectorDigest !== identity.collectorDigest || !content.valid || digest(report.content) !== digest(content) || !indexCurrent || report.ledgerDigest !== sha256(readBytes(root, 'provenance/content-ledger.json')) || report.indexDigest !== sha256(readBytes(root, 'provenance/dependency-index.json')) || report.lockDigest !== sha256(readBytes(root, 'package-lock.json')) || report.errors?.length !== 0 || report.dependency?.candidateCount !== index.candidates.length || report.dependency.valid !== true || report.dependency.collectionValid !== true || report.traces?.valid !== true || !Array.isArray(report.traces.observations) || !report.traces.limitations?.length) throw new Error('Incomplete, stale or inconsistent provenance report');
  if (expectedBuild && (digest(report.build) !== digest(expectedBuild) || digest(selectedBuildIdentity(root, sourceId)) !== digest(expectedBuild))) throw new Error('Build/source provenance mismatch');
  if (!expectedBuild && report.build !== null) throw new Error('Build evidence needs selected record');
  if (!Array.isArray(report.artifacts) || report.artifacts.length !== 1 || report.artifacts[0].path !== 'notices.json' || report.artifacts[0].sha256 !== sha256(readBytes(output, 'notices.json'))) throw new Error('Provenance artifact digest mismatch');
  const bundle = json(output, 'notices.json', 64 * 1024 * 1024);
  if (bundle.schema !== 1 || bundle.sourceId !== sourceId || bundle.sourceFingerprint !== identity.fingerprint || bundle.valid !== true || !Array.isArray(bundle.packages) || bundle.packages.length !== index.candidates.length) throw new Error('Incomplete notice inventory');
  // Reconcile every expected identity, full text digest and explicit collection
  // status. No empty/truncated report can pass by setting complete:true alone.
  for (const [i, candidate] of index.candidates.entries()) {
    const pkg = bundle.packages[i];
    if (pkg.path !== candidate.path || pkg.name !== candidate.name || pkg.lockedVersion !== candidate.version || pkg.complete !== true || !['observed_matching', 'not_observed_installed'].includes(pkg.status) || !Array.isArray(pkg.notices) || !Array.isArray(pkg.banners) || !Array.isArray(pkg.diagnostics)) throw new Error('Incomplete package observation');
    if (pkg.status === 'not_observed_installed' && (pkg.notices.length || pkg.banners.length)) throw new Error('Absent package attributed notices');
    for (const notice of pkg.notices) {
      relative(notice.path);
      if (notice.complete !== true || typeof notice.text !== 'string' || notice.bytes !== Buffer.byteLength(notice.text) || notice.sha256 !== sha256(notice.text)) throw new Error('Truncated notice text');
    }
    for (const banner of pkg.banners) { relative(banner.path); if (typeof banner.text !== 'string' || banner.sha256 !== sha256(banner.text) || !/^[a-f0-9]{64}$/.test(banner.sourceSha256)) throw new Error('Invalid embedded observation'); }
  }
  const matching = bundle.packages.filter((p: { status: string }) => p.status === 'observed_matching').length;
  if (report.dependency.observedCount !== matching || report.dependency.notObservedCount !== index.candidates.length - matching) throw new Error('Incomplete observation counts');
  const observed = collectNotices(root, index);
  if (!observed.valid || digest(bundle) !== digest({ sourceId, sourceFingerprint: identity.fingerprint, ...observed })) throw new Error('Notice observation missing, stale or changed');
  const traces = expectedBuild ? observeTraces(root) : { valid: true, observations: [], errors: [], limitations: ['No selected build; no distribution evidence collected'] };
  if (digest(report.traces) !== digest(traces) || digest(report.gaps) !== digest([...content.gaps, ...observed.gaps, ...traces.limitations])) throw new Error('Distribution observations or owner gaps incomplete');
  if (sourceIdentity(root).fingerprint !== identity.fingerprint) throw new Error('Source changed during report ingestion');
  return report as ReturnType<typeof checkProvenance>;
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
  const [action, ...args] = process.argv.slice(2); const root = process.cwd();
  if (action === 'refresh') { if (args.length) throw new Error('Refresh takes no arguments'); refreshPortable(root); }
  else if (action === 'check') {
    const options: Options = { output: path.join(root, 'provenance-results/current') };
    for (let i = 0; i < args.length; i += 2) {
      if (!args[i + 1]) throw new Error('Missing option value');
      if (args[i] === '--output') options.output = args[i + 1];
      else if (args[i] === '--source-id') options.sourceId = args[i + 1];
      else if (args[i] === '--build-record') options.buildRecord = args[i + 1];
      else throw new Error('Unknown provenance option');
    }
    const report = checkProvenance(root, options);
    if (report.complete) readProvenanceReport(options.output, root, report.sourceId, report.build ?? undefined);
    console.log(JSON.stringify({ complete: report.complete, permissionState: report.permissionState, sourceId: report.sourceId, gaps: report.gaps.length, errors: [...report.errors, ...report.content.errors] }));
    process.exitCode = report.complete ? 0 : 1;
  } else throw new Error('Use refresh or check');
  } catch {
    console.error(JSON.stringify({ complete: false, permissionState: 'permission_not_established', diagnostic: 'Provenance input, path, identity or artifact validation failed; inspect source-bound technical evidence. No portable artifact was silently refreshed by check.' }));
    process.exitCode = 1;
  }
}
