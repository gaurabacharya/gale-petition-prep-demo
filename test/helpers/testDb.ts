import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../../src/db/db";
import { migrate } from "../../src/db/migrate";

type Queryable = Pick<PGlite, "query" | "exec">;

function adapt(q: Queryable, transaction: Db["transaction"], close: Db["close"]): Db {
  return {
    query: async <R>(sql: string, params?: readonly unknown[]) => {
      const res = await q.query<R>(sql, params ? [...params] : undefined);
      return { rows: res.rows };
    },
    exec: async (sql: string) => {
      await q.exec(sql);
    },
    transaction,
    close,
  };
}

/** A fresh in-memory Postgres with every migration applied. */
export async function makeTestDb(): Promise<Db> {
  const lite = new PGlite();
  const db: Db = adapt(
    lite,
    (fn) => lite.transaction((tx) => fn(adapt(tx as unknown as Queryable, (inner) => inner(db), async () => {}))),
    () => lite.close(),
  );
  await migrate(db, "migrations");
  return db;
}

export async function insertCase(db: Db, label = "Test case"): Promise<string> {
  const { rows } = await db.query<{ id: string }>("insert into cases (label) values ($1) returning id", [label]);
  return rows[0].id;
}
