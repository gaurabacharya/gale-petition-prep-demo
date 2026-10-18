import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { Hono } from "hono";
import { Effect, Layer } from "effect";
import pg from "pg";
import { makeApp } from "./api/app";
import { AuditLogPg } from "./audit/audit";
import { makePgDb } from "./db/pg";
import { llmProviderFromEnv } from "./llm/config";
import { makeLlmClientLayer } from "./llm/LlmClient";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// Fail fast on a bad LLM_PROVIDER or a missing API key.
const provider = await Effect.runPromise(llmProviderFromEnv(process.env));

const db = makePgDb(new pg.Pool({ connectionString: databaseUrl }));
const audit = AuditLogPg(db);
const layer = Layer.merge(audit, makeLlmClientLayer(provider).pipe(Layer.provide(audit)));
const demoMode = process.env.DEMO_MODE !== "false";

const port = Number(process.env.PORT ?? 3000);
const root = new Hono();
root.route("/", makeApp({ db, layer, demoMode }));
// Serve the built review UI (npm run build:web) after the API routes; unknown paths fall back to index.html.
if (existsSync("web/dist")) {
  root.use("/*", serveStatic({ root: "./web/dist" }));
  root.get("*", serveStatic({ path: "./web/dist/index.html" }));
}
serve({ fetch: root.fetch, port });
console.log(`Petition Prep API on :${port} (provider ${provider.name}, demo mode ${demoMode ? "on" : "off"})`);
