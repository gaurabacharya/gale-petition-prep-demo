import { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db";

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

function wrapTransaction(tx: Queryable): Db {
  const inner: Db = adapt(tx, (fn) => fn(inner), async () => {});
  return inner;
}

/** Postgres compiled to WASM, in memory or persisted to `dataDir`. Nested transactions join the outer one. */
export function makePgliteDb(dataDir?: string): Db {
  const lite = new PGlite(dataDir);
  return adapt(
    lite,
    (fn) => lite.transaction((tx) => fn(wrapTransaction(tx as unknown as Queryable))),
    () => lite.close(),
  );
}
