import { expect, test } from 'vitest';
import { dependencyIndex } from '../scripts/provenance/dependencies.mjs';

const manifest = { dependencies: { alpha: '1' }, devDependencies: { beta: '2' } };
const lock = { lockfileVersion: 3, packages: { '': {}, 'node_modules/alpha': { version: '1', license: 'MIT', integrity: 'sha512-example' }, 'node_modules/beta': { version: '2', dev: true }, 'node_modules/alpha/node_modules/optional': { version: '3', optional: true, os: ['other-os'], cpu: ['other-cpu'] } } };
test('portable index retains every non-root candidate, nested identity and overlapping flags', () => {
  const index = dependencyIndex(manifest, lock);
  expect(index.candidates).toHaveLength(3);
  expect(index.candidates[0]).toMatchObject({ path: 'node_modules/alpha', name: 'alpha', version: '1', relationship: 'direct-runtime-declaration', integrity: 'sha512-example' });
  expect(index.candidates[1]).toMatchObject({ path: 'node_modules/alpha/node_modules/optional', optional: true, relationship: 'transitive', os: ['other-os'] });
  expect(index.candidates[2]).toMatchObject({ dev: true, relationship: 'direct-development-declaration' });
  expect(dependencyIndex(manifest, lock)).toEqual(index);
  expect(JSON.stringify(index)).not.toContain('shipped":true');
});
test('unsafe and malformed lock candidates fail before filesystem access', () => {
  for (const key of ['../escape', '/absolute', 'node_modules/../escape', 'node_modules/a//node_modules/b', 'src/a', 'node_modules/a/package.json']) {
    expect(() => dependencyIndex({}, { lockfileVersion: 3, packages: { '': {}, [key]: { version: '1' } } })).toThrow();
  }
  expect(() => dependencyIndex({}, { lockfileVersion: 2, packages: {} })).toThrow();
});
