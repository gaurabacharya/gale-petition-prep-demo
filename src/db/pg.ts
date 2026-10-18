import pg from "pg";
import type { Db } from "./db";

type Runner = pg.Pool | pg.PoolClient;

function runnerMethods(runner: Runner): Pick<Db, "query" | "exec"> {
  return {
    query: async <R>(sql: string, params?: readonly unknown[]) => {
      const res = await runner.query(sql, params ? [...params] : undefined);
      return { rows: res.rows as R[] };
    },
    exec: async (sql: string) => {
      await runner.query(sql);
    },
  };
}

export function makePgDb(pool: pg.Pool): Db {
  return {
    ...runnerMethods(pool),
    transaction: async <T>(fn: (tx: Db) => Promise<T>) => {
      const client = await pool.connect();
      const tx: Db = {
        ...runnerMethods(client),
        transaction: (inner) => inner(tx),
        close: async () => {},
      };
      try {
        await client.query("BEGIN");
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
