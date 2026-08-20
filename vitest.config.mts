import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // All integration tests share one PostgreSQL test database; run test files
  // sequentially so their TRUNCATE-based reset never deadlocks.
  fileParallelism: false,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup-env.ts"],
    hookTimeout: 20000,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.join(process.cwd(), "src"),
    },
  },
});
