import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "./db";
import { migrateFromSql } from "./migrateSql";

export { migrateFromSql };

/** Applies each unapplied `.sql` file in `dir`, in filename order. Returns the files it applied. */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  const names = (await readdir(dir)).filter((f) => f.endsWith(".sql"));
  const files = await Promise.all(names.map(async (name) => ({ name, sql: await readFile(join(dir, name), "utf8") })));
  return migrateFromSql(db, files);
}
