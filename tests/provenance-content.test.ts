import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refreshContent, validateContent } from '../scripts/provenance/content.mjs';

const trees: string[] = [];
afterEach(() => { for (const dir of trees.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'provenance-content-')); trees.push(dir);
  fs.mkdirSync(path.join(dir, 'src')); fs.writeFileSync(path.join(dir, 'src/code.ts'), 'code');
  fs.mkdirSync(path.join(dir, 'assets')); fs.writeFileSync(path.join(dir, 'assets/map.png'), 'image');
  return dir;
}
test('Git-free current unknown coverage passes reproducibly without granting permission', () => {
  const dir = fixture(); const ledger = refreshContent(dir);
  expect(refreshContent(dir)).toEqual(ledger);
  expect(validateContent(dir, ledger)).toMatchObject({ valid: true, permissionState: 'permission_not_established' });
  expect(validateContent(dir, ledger).gaps.length).toBeGreaterThan(0);
});
test('stale assets, unowned additions, and duplicate primary ownership fail', () => {
  const dir = fixture(); const ledger = refreshContent(dir);
  fs.writeFileSync(path.join(dir, 'assets/map.png'), 'changed');
  expect(validateContent(dir, ledger).errors.join()).toContain('stale');
  fs.writeFileSync(path.join(dir, 'src/new.ts'), 'new');
  expect(validateContent(dir, ledger).errors.join()).toContain('uncovered');
  ledger.entries.push(structuredClone(ledger.entries[0]));
  expect(validateContent(dir, ledger).errors.join()).toContain('duplicate');
});
test('verified evidence must bind exact expanded membership, use, and revision', () => {
  const dir = fixture(); const ledger = refreshContent(dir); const entry = ledger.entries[0];
  entry.permission.status = 'verified';
  expect(validateContent(dir, ledger).errors.join()).toContain('evidence');
  entry.permission.evidence = { recordId: 'OWNER-1', custodian: 'owner', reference: 'records/OWNER-1', reviewRecord: 'review-1', membershipDigest: entry.membershipDigest, intendedUse: entry.intendedUse, revision: entry.membershipDigest };
  expect(validateContent(dir, ledger).valid).toBe(true);
  fs.writeFileSync(path.join(dir, 'assets/new.png'), 'new');
  expect(() => refreshContent(dir, ledger)).toThrow('verified');
});
test('unsafe paths and symlink roots or parents are refused; excluded bytes are never inventoried', () => {
  const dir = fixture(); const ledger = refreshContent(dir);
  for (const name of ['/tmp/outside', '../outside', 'unknown/file', 'src/../src/code.ts', 'src//code.ts']) {
    const altered = structuredClone(ledger); altered.entries[0].files[0].path = name;
    expect(validateContent(dir, altered).valid).toBe(false);
  }
  fs.writeFileSync(path.join(dir, '.env.private'), 'secret');
  expect(refreshContent(dir)).toEqual(ledger);
  fs.mkdirSync(path.join(dir, 'mystery'));
  expect(() => refreshContent(dir)).toThrow('Unknown root');
  fs.rmdirSync(path.join(dir, 'mystery'));
  fs.symlinkSync('../src', path.join(dir, 'assets/link'));
  expect(() => refreshContent(dir)).toThrow('symlink');
  expect(() => refreshContent(path.join(dir, 'assets/link'))).toThrow();
});
