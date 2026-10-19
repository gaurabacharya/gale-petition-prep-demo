import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";
import type { Db } from "./db";
import { makePgDb } from "./pg";
import { makePgliteDb } from "./pglite";

/**
 * Opens the database named by DATABASE_URL. `pglite:<dir>` runs embedded Postgres persisted to that
 * directory (`pglite:memory` is throwaway); anything else is a Postgres connection string.
 */
export async function openDb(url: string): Promise<Db> {
  if (!url.startsWith("pglite:")) return makePgDb(new pg.Pool({ connectionString: url }));
  const dir = url.slice("pglite:".length);
  if (dir === "memory" || dir === "") return makePgliteDb();
  mkdirSync(dirname(dir), { recursive: true }); // PGlite creates only the last path segment
  return makePgliteDb(dir);
}
