import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refreshPortable, checkProvenance, readProvenanceReport, selectedBuildIdentity } from '../scripts/provenance.mjs';
import { digest, serialize } from '../scripts/provenance/safe-files.mjs';

const trees: string[] = [];
afterEach(() => { for (const dir of trees.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'provenance-report-')); trees.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"":{},"node_modules/optional":{"version":"1","optional":true}}}\n');
  fs.mkdirSync(path.join(root, 'scripts')); fs.writeFileSync(path.join(root, 'scripts/provenance.mts'), 'fixture collector identity');
  refreshPortable(root);
  return { root, output: path.join(root, 'provenance-results/current') };
}
test('Git-free unknown permissions pass technical validation and report complete source-bound evidence', () => {
  const { root, output } = fixture();
  const report = checkProvenance(root, { output });
  expect(report.complete).toBe(true); expect(report.permissionState).toBe('permission_not_established');
  expect(report.gaps.length).toBeGreaterThan(0);
  expect(readProvenanceReport(output, root, report.sourceId).complete).toBe(true);
  const first = fs.readFileSync(path.join(output, 'report.json'), 'utf8');
  checkProvenance(root, { output });
  expect(fs.readFileSync(path.join(output, 'report.json'), 'utf8')).toBe(first);
});
test('check never refreshes drifted content or index; incomplete evidence cannot pass ingestion', () => {
  const { root, output } = fixture();
  fs.appendFileSync(path.join(root, 'package.json'), ' ');
  const before = fs.readFileSync(path.join(root, 'provenance/content-ledger.json'), 'utf8');
  expect(checkProvenance(root, { output }).complete).toBe(false);
  expect(fs.readFileSync(path.join(root, 'provenance/content-ledger.json'), 'utf8')).toBe(before);
  expect(() => readProvenanceReport(output, root, '0'.repeat(64))).toThrow();
  refreshPortable(root);
  fs.appendFileSync(path.join(root, 'provenance/dependency-index.json'), ' ');
  expect(checkProvenance(root, { output }).complete).toBe(false);
});
test.each(['digest', 'section', 'permission', 'source', 'empty-notices', 'extra-private-section'] as const)('success-shaped %s tampering fails ingestion even with rehashed report', kind => {
  const { root, output } = fixture(); const report = checkProvenance(root, { output });
  const changed = JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8'));
  if (kind === 'digest') changed.reportDigest = '0'.repeat(64);
  if (kind === 'section') delete changed.content;
  if (kind === 'permission') { changed.permissionState = 'licensed'; changed.gaps = []; }
  if (kind === 'source') changed.sourceId = '0'.repeat(64);
  if (kind === 'empty-notices') fs.writeFileSync(path.join(output, 'notices.json'), '{}\n');
  if (kind === 'extra-private-section') changed.privateSession = 'DO NOT PUBLISH';
  if (kind !== 'digest') { delete changed.reportDigest; changed.reportDigest = digest(changed); }
  fs.writeFileSync(path.join(output, 'report.json'), serialize(changed));
  expect(() => readProvenanceReport(output, root, report.sourceId)).toThrow();
});
test('artifact allowlist rejects extra private/image files and unsafe output paths before writing', () => {
  const { root, output } = fixture(); const report = checkProvenance(root, { output });
  fs.writeFileSync(path.join(output, 'private-contract.pdf'), 'DO NOT PUBLISH');
  expect(() => readProvenanceReport(output, root, report.sourceId)).toThrow();
  expect(() => checkProvenance(root, { output: path.join(root, 'public/notices') })).toThrow();
  expect(() => checkProvenance(root, { output: path.join(root, 'provenance-results/../public') })).toThrow();
  expect(JSON.stringify(report)).not.toContain(root);
  expect(JSON.stringify(report)).not.toContain('DO NOT PUBLISH');
});
test('selected build fingerprint and source record must agree, including after collection', () => {
  const { root, output } = fixture();
  fs.mkdirSync(path.join(root, '.next')); fs.writeFileSync(path.join(root, '.next/BUILD_ID'), 'fixture-build');
  fs.mkdirSync(path.join(root, 'prisma/migrations'), { recursive: true }); fs.writeFileSync(path.join(root, 'prisma/schema.prisma'), 'fixture schema');
  fs.mkdirSync(path.join(root, 'baseline-results/fixture'), { recursive: true });
  refreshPortable(root);
  const sourceId = 'a'.repeat(64); const build = selectedBuildIdentity(root, sourceId);
  const record = path.join(root, 'baseline-results/fixture/run.json');
  fs.writeFileSync(record, serialize({ sourceId, build }));
  expect(checkProvenance(root, { output, sourceId, buildRecord: record }).complete).toBe(true);
  expect(readProvenanceReport(output, root, sourceId, build).complete).toBe(true);
  fs.writeFileSync(path.join(root, '.next/BUILD_ID'), 'different-build');
  expect(() => readProvenanceReport(output, root, sourceId, build)).toThrow();
  expect(checkProvenance(root, { output, sourceId, buildRecord: record }).complete).toBe(false);
  fs.writeFileSync(record, serialize({ sourceId: 'b'.repeat(64), build }));
  expect(checkProvenance(root, { output, sourceId, buildRecord: record }).complete).toBe(false);
});
