import { afterAll } from 'vitest';
import { acquireLease, assertLease, resolveTarget } from '../scripts/test-database.mjs';

// Resolve before Prisma loads. No dotenv file is read by the test workflow.
const target = resolveTarget();
Object.assign(process.env, target.env);
if (process.env.BASELINE_DB_LEASE) assertLease(target);
else {
  const lease = acquireLease(target);
  afterAll(() => lease.release());
}
