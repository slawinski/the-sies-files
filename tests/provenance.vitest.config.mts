import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Pure filesystem fixtures need neither application setup nor a database lease.
export default defineConfig({ resolve: { alias: { '@': path.join(process.cwd(), 'src') } }, test: { environment: 'node', include: ['tests/provenance-*.test.ts', 'tests/regression-baseline-tooling.test.ts'], fileParallelism: false } });
