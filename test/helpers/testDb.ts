import type { Db } from "../../src/db/db";
import { migrate } from "../../src/db/migrate";
import { makePgliteDb } from "../../src/db/pglite";

/** A fresh in-memory Postgres with every migration applied. */
export async function makeTestDb(): Promise<Db> {
  const db = makePgliteDb();
  await migrate(db, "migrations");
  return db;
}

export async function insertCase(db: Db, label = "Test case"): Promise<string> {
  const { rows } = await db.query<{ id: string }>("insert into cases (label) values ($1) returning id", [label]);
  return rows[0].id;
}
