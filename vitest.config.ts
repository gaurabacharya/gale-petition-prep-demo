import { defineConfig } from "vitest/config";

// Each PGlite database is a WASM Postgres; starting several at once in parallel workers is slow.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], hookTimeout: 60_000, testTimeout: 30_000 } });
