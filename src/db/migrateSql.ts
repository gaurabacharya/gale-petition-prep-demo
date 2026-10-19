import type { Db } from "./db";

/** Applies each unapplied migration, in name order. No file system, so the browser build can use it too. */
export async function migrateFromSql(db: Db, files: readonly { name: string; sql: string }[]): Promise<string[]> {
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
  );
  const ran: string[] = [];
  for (const { name, sql } of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    if (applied.has(name)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into schema_migrations (name) values ($1)", [name]);
    });
    ran.push(name);
  }
  return ran;
}
