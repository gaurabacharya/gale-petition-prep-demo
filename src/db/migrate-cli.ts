import pg from "pg";
import { makePgDb } from "./pg";
import { migrate } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = makePgDb(new pg.Pool({ connectionString: url }));
const ran = await migrate(db, "migrations");
console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Up to date");
await db.close();
