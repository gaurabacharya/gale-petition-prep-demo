import { defineConfig } from "vitest/config";

// Each PGlite database is a WASM Postgres; starting several at once in parallel workers is slow.
// Component tests opt into jsdom per file with `// @vitest-environment jsdom`.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { include: ["test/**/*.test.{ts,tsx}"], hookTimeout: 60_000, testTimeout: 30_000 },
});
