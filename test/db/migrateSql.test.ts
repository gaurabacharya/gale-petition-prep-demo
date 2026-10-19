import { afterAll, describe, expect, it } from "vitest";
import { migrateFromSql } from "../../src/db/migrateSql";
import { makePgliteDb } from "../../src/db/pglite";

const db = makePgliteDb();
afterAll(() => db.close());

describe("migrateFromSql", () => {
  it("applies migrations in name order once, with no file system", async () => {
    const files = [
      { name: "002_b.sql", sql: "insert into t (v) values ('b');" },
      { name: "001_a.sql", sql: "create table t (v text);" },
    ];
    expect(await migrateFromSql(db, files)).toEqual(["001_a.sql", "002_b.sql"]);
    expect(await migrateFromSql(db, files)).toEqual([]);
    expect((await db.query<{ v: string }>("select v from t")).rows).toEqual([{ v: "b" }]);
  });
});
