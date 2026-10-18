import pg from "pg";
import { makePgDb } from "./pg";

// Wipes every case, document, field, letter and audit row so a recording starts from a known state.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (process.env.DEMO_MODE === "false") {
  console.error("Refusing to reset: DEMO_MODE=false");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("This deletes ALL cases and audit rows in the database named by DATABASE_URL. Re-run with --yes to confirm.");
  process.exit(1);
}

const db = makePgDb(new pg.Pool({ connectionString: url }));
await db.exec("truncate cases, audit_log restart identity cascade");
console.log("Demo database reset");
await db.close();
