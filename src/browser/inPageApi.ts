import { Layer } from "effect";
import { makeApp } from "../api/app";
import { AuditLogPg } from "../audit/audit";
import type { Db } from "../db/db";
import { migrateFromSql } from "../db/migrateSql";
import { makePgliteDb } from "../db/pglite";
import { makeLlmClientLayer } from "../llm/LlmClient";
import { makeReplayProvider } from "../llm/replay";
import { interceptFetch } from "./fetchRoute";

/** Where each visitor's cases live: IndexedDB in their own browser. */
export const DB_NAME = "idb://petition-prep";

const migrations = Object.entries(
  import.meta.glob<string>("../../migrations/*.sql", { query: "?raw", import: "default", eager: true }),
).map(([path, sql]) => ({ name: path.split("/").pop()!, sql }));

/**
 * Runs the real API (the same Hono app the Node server uses) inside the page, with replay answers and a
 * database stored in the visitor's browser. Nothing is sent to any server.
 */
export async function startInPageApi(): Promise<{ db: Db }> {
  const db = makePgliteDb(DB_NAME);
  await migrateFromSql(db, migrations);
  const audit = AuditLogPg(db);
  const provider = makeReplayProvider();
  const layer = Layer.merge(audit, makeLlmClientLayer(provider).pipe(Layer.provide(audit)));
  const app = makeApp({ db, layer, demoMode: true, modelName: `${provider.name}:${provider.model}` });
  window.fetch = interceptFetch(
    window.fetch.bind(window),
    async (request) => app.fetch(request),
    window.location.origin,
    import.meta.env.BASE_URL,
  );
  return { db };
}

/** Empties this browser's demo database, the same reset `npm run demo:reset` does. */
export async function resetBrowserDb(db: Db): Promise<void> {
  await db.exec("truncate cases, audit_log restart identity cascade");
}
