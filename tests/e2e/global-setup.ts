import { acquireLease, assertLease, resetDatabase, resolveTarget } from '../../scripts/test-database.mjs';

export default async function globalSetup() {
  const target = resolveTarget();
  if (process.env.BASELINE_DB_LEASE) {
    assertLease(target);
    // The baseline owner resets before launching the server, never underneath it.
    return;
  }
  const lease = acquireLease(target);
  try { resetDatabase(target, lease.token); }
  catch (error) { lease.release(); throw error; }
  return () => lease.release();
}
