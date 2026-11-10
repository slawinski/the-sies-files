import { defineConfig } from 'vitest/config';

// Pure filesystem fixtures need neither application setup nor a database lease.
export default defineConfig({ test: { environment: 'node', include: ['tests/provenance-*.test.ts'], fileParallelism: false } });
