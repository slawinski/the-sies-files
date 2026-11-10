import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { A_REVISION, prepareCompatibilitySource, readCompatibilityReport } from '../scripts/command-receipt-compatibility.mjs';
import { readCommandReceipt } from '@/lib/command-contracts';
import negatives from './fixtures/command-receipts/unsupported.json';

it('refuses an unknown or unavailable A object rather than substituting current producers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcomes-compat-red-'));
  try {
    expect(() => prepareCompatibilitySource(dir, path.join(dir, 'a'), 'unknown')).toThrow();
    expect(() => prepareCompatibilitySource(dir, path.join(dir, 'a'), A_REVISION)).toThrow();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
it('portable negative fixtures remain non-destructive typed refusals', () => {
  for (const receipt of negatives.receipts) {
    const before = JSON.stringify(receipt);
    expect(() => readCommandReceipt(receipt)).toThrowError(expect.objectContaining({ code: 'COMMAND_RECEIPT_INVALID' }));
    expect(JSON.stringify(receipt)).toBe(before);
  }
});

it('report validation refuses failed, omitted, identity-mismatched and effect-changing observations', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcomes-report-validator-'));
  const entries = [{ path: 'validator-only-fixture', sha256: 'a'.repeat(64) }];
  const report = {
    complete: true,
    producerA: { revision: A_REVISION, sourceId: createHash('sha256').update(JSON.stringify(entries)).digest('hex'), entries },
    producerB: { sourceId: 'b'.repeat(64), entries },
    migrations: ['20261109110000_command_receipt_metadata'], limitations: ['NOT_SAFE_OPERATIONAL_ROLLBACK'],
    originalIdentityFloor: Object.fromEntries(Object.entries({ unit: 292, ordinary: 38, security: 18, physical: 1 }).map(([kind, count]) => [kind, { original: count, retained: count, missing: [] }])),
    observations: ['A_PRE_MIGRATION_STATUS', 'A_B_STATUS', 'A_B_POST_REFUSED', 'B_B_STATUS', 'B_B_DUPLICATE', 'B_A_STATUS', 'B_A_DUPLICATE'].flatMap(id => ['addPlayer', 'createCheckpoint', 'scanQr'].map(operation => ({ id, operation, passed: true, beforeHash: 'c'.repeat(64), afterHash: 'c'.repeat(64),
      beforeEffects: { players: 1, scans: 1, events: 5, receipts: 3, version: 4 }, afterEffects: { players: 1, scans: 1, events: 5, receipts: 3, version: 4 } }))),
  };
  const file = path.join(dir, 'compatibility.json');
  try {
    fs.writeFileSync(file, JSON.stringify(report));
    expect(readCompatibilityReport(file, 'b'.repeat(64)).complete).toBe(true); // Validator-only fixture, never a producer claim.
    for (const patch of [{ complete: false }, { observations: report.observations.slice(1) },
      { producerB: { sourceId: 'wrong', entries } }, { migrations: [] }, { originalIdentityFloor: {} },
      { observations: report.observations.map((o, i) => i ? o : { ...o, passed: false }) },
      { observations: report.observations.map((o, i) => i ? o : { ...o, afterEffects: { ...o.afterEffects, scans: 2 } }) },
      { observations: report.observations.map((o, i) => i ? o : { ...o, afterHash: 'd'.repeat(64) }) }]) {
      fs.writeFileSync(file, JSON.stringify({ ...report, ...patch }));
      expect(() => readCompatibilityReport(file, 'b'.repeat(64))).toThrow();
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
it('requires complete source-attributed compatibility evidence, never an absent or truncated report', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcomes-compat-report-'));
  try {
    expect(() => readCompatibilityReport(path.join(dir, 'compatibility.json'), 'b'.repeat(64))).toThrow();
    fs.writeFileSync(path.join(dir, 'compatibility.json'), '{');
    expect(() => readCompatibilityReport(path.join(dir, 'compatibility.json'), 'b'.repeat(64))).toThrow();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
