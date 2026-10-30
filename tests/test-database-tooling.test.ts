import { expect, test } from 'vitest';
import { resolveTarget, acquireLease, assertLease } from '../scripts/test-database.mjs';

test('explicit target is identical for Prisma and libpq with decoded credentials', () => {
  const t = resolveTarget({ DATABASE_URL: 'postgresql://u%40ser:p%40ss%27%24@127.0.0.1:55439/baseline_test', PGSERVICEFILE: '/not-read', PGSERVICE: 'wrong' });
  expect(t.env.DATABASE_URL).toBe(t.env.E2E_DATABASE_URL);
  expect(t.env.PGUSER).toBe('u@ser');
  expect(t.env.PGPASSWORD).toBe("p@ss'$");
  expect(JSON.stringify(t.public)).not.toContain('p@ss');
  expect(t.env.PGSERVICEFILE).toBeUndefined();
});
test.each([
  {}, { DATABASE_URL: 'not a URL' },
  { DATABASE_URL: 'postgresql://u@remote.example/a_test' },
  { DATABASE_URL: 'postgresql://u@localhost/production' },
  { DATABASE_URL: 'postgresql://u@localhost/a_test?host=remote' },
  { DATABASE_URL: 'postgresql://u@localhost/a_test', E2E_DATABASE_URL: 'postgresql://u@localhost/b_test' },
])('refuses unsafe or ambiguous input without leaking its value: %j', env => {
  expect(() => resolveTarget(env)).toThrow('Explicit local disposable');
});
test('second owner cannot acquire or impersonate a database lease', () => {
  const t = resolveTarget({ DATABASE_URL: `postgresql://u@127.0.0.1/baseline_${process.pid}_test` });
  const lease = acquireLease(t);
  try {
    expect(() => acquireLease(t)).toThrow('already owned');
    expect(() => assertLease(t, 'incorrect')).toThrow('ownership');
    expect(() => assertLease(t, lease.token)).not.toThrow();
  } finally { lease.release(); }
  acquireLease(t).release();
});
test('a different database cannot claim an already owned port', () => {
  const a = resolveTarget({ DATABASE_URL: `postgresql://u@127.0.0.1/port_a_${process.pid}_test` });
  const b = resolveTarget({ DATABASE_URL: `postgresql://u@localhost/port_b_${process.pid}_test` });
  const lease = acquireLease(a, 3100);
  try { expect(() => acquireLease(b, 3100)).toThrow('already owned'); }
  finally { lease.release(); }
  acquireLease(b, 3100).release();
});
