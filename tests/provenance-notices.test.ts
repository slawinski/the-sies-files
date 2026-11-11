import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { dependencyIndex } from '../scripts/provenance/dependencies.mjs';
import { collectNotices, observeTraces } from '../scripts/provenance/notices.mjs';

const trees: string[] = [];
afterEach(() => { for (const dir of trees.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'provenance-notices-')); trees.push(root);
  fs.mkdirSync(path.join(root, 'node_modules/lucide-react'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/lucide-react/package.json'), JSON.stringify({ name: 'lucide-react', version: '1.34.0' }));
  const index = dependencyIndex({}, { lockfileVersion: 3, packages: { '': {}, 'node_modules/lucide-react': { version: '1.34.0', license: 'ISC' }, 'node_modules/foreign': { version: '1', optional: true, os: ['foreign'] } } });
  return { root, index, file: path.join(root, 'node_modules/lucide-react/LICENSE') };
}
const terms = 'ISC License\nCopyright Lucide Icons and Contributors\nPermission to use, copy, modify, and/or distribute\nTHE SOFTWARE IS PROVIDED AS IS\nFeather-derived icons: activity, airplay, alert-circle\nMIT License\nCopyright Cole Bemis\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\nTHE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND.\n';
test('full multi-license bytes, Feather list, conditions and disclaimer survive collection', () => {
  const { root, index, file } = fixture(); fs.writeFileSync(file, terms);
  fs.writeFileSync(path.join(path.dirname(file), 'NOTICE'), 'Additional public notice\n');
  const result = collectNotices(root, index);
  expect(result.valid).toBe(true);
  expect(result.packages.find(p => p.name === 'foreign')).toMatchObject({ status: 'not_observed_installed' });
  const installed = result.packages.find(p => p.name === 'lucide-react')!;
  expect(installed.status).toBe('observed_matching');
  expect(installed.notices).toHaveLength(2);
  expect(installed.notices[0]).toMatchObject({ text: terms, sha256: createHash('sha256').update(terms).digest('hex'), complete: true });
  expect(collectNotices(root, index)).toEqual(result);
});
test('name/version mismatch fails release attribution, not optional absence', () => {
  const { root, index, file } = fixture(); fs.writeFileSync(file, terms);
  fs.writeFileSync(path.join(path.dirname(file), 'package.json'), JSON.stringify({ name: 'impostor', version: '9' }));
  const result = collectNotices(root, index);
  expect(result.valid).toBe(false);
  expect(result.packages.find(p => p.name === 'lucide-react')).toMatchObject({ status: 'identity_mismatch', notices: [] });
});
test.each(['symlink', 'binary', 'invalid-utf8', 'oversized', 'directory'] as const)('unsafe %s notice is explicitly incomplete, never truncated', kind => {
  const { root, index, file } = fixture();
  if (kind === 'symlink') fs.symlinkSync('/etc/passwd', file);
  if (kind === 'binary') fs.writeFileSync(file, Buffer.from([0, 1, 2]));
  if (kind === 'invalid-utf8') fs.writeFileSync(file, Buffer.from([0xc3, 0x28]));
  if (kind === 'oversized') fs.writeFileSync(file, Buffer.alloc(2 * 1024 * 1024 + 1, 65));
  if (kind === 'directory') fs.mkdirSync(file);
  const result = collectNotices(root, index);
  expect(result.valid).toBe(false);
  expect(result.packages.find(p => p.name === 'lucide-react')!.notices).toEqual([]);
  expect(result.packages.find(p => p.name === 'lucide-react')!.complete).toBe(false);
});
test('symlink package parents are unsafe; missing notices remain explicit gaps', () => {
  const { root, index } = fixture();
  expect(collectNotices(root, index).gaps.join()).toContain('No conventional notice');
  fs.renameSync(path.join(root, 'node_modules'), path.join(root, 'outside'));
  fs.symlinkSync('outside', path.join(root, 'node_modules'));
  expect(collectNotices(root, index).valid).toBe(false);
});
test('bounded embedded banners are observations, not full bundle composition', () => {
  const { root, index, file } = fixture(); fs.writeFileSync(file, terms);
  fs.mkdirSync(path.join(path.dirname(file), 'dist'));
  fs.writeFileSync(path.join(path.dirname(file), 'dist/index.js'), '/*! public upstream copyright */\nexport {};');
  const pkg = collectNotices(root, index).packages.find(p => p.name === 'lucide-react')!;
  expect(pkg.banners[0].text).toContain('public upstream copyright');
});
test('selected traces reject escapes and secrets without copying traced bytes', () => {
  const { root } = fixture(); fs.mkdirSync(path.join(root, '.next'));
  fs.writeFileSync(path.join(root, '.next/next-server.js.nft.json'), JSON.stringify({ version: 1, files: ['../node_modules/lucide-react/package.json'] }));
  expect(observeTraces(root).valid).toBe(true);
  for (const name of ['/etc/passwd', '../../outside', '../.env', '../assets/map.png']) {
    fs.writeFileSync(path.join(root, '.next/next-server.js.nft.json'), JSON.stringify({ version: 1, files: [name] }));
    const result = observeTraces(root);
    expect(result.valid).toBe(false); expect(JSON.stringify(result)).not.toContain(name);
  }
});
test('package text budget is cumulative and never truncates an accepted notice', () => {
  const { root, index, file } = fixture();
  for (let i = 0; i < 9; i++) fs.writeFileSync(`${file}-${i}`, Buffer.alloc(2 * 1024 * 1024, 65));
  const pkg = collectNotices(root, index).packages.find(p => p.name === 'lucide-react')!;
  expect(pkg.complete).toBe(false);
  expect(pkg.diagnostics.join()).toContain('Notice text limit');
  expect(pkg.notices).toHaveLength(8);
  expect(pkg.notices.every(n => n.complete && n.bytes === 2 * 1024 * 1024)).toBe(true);
});
test('secret names are excluded before reads and copyright source files are not notice documents', () => {
  const { root, index, file } = fixture(); fs.writeFileSync(file, terms);
  fs.symlinkSync('/nonexistent/private', path.join(path.dirname(file), '.env.private'));
  fs.writeFileSync(path.join(path.dirname(file), 'copyright.js'), 'PRIVATE SOURCE MARKER');
  const result = collectNotices(root, index);
  expect(result.valid).toBe(true);
  expect(JSON.stringify(result)).not.toContain('PRIVATE SOURCE MARKER');
  expect(JSON.stringify(result)).not.toContain('/nonexistent/private');
});
