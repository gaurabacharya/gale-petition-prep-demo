import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db";
import { migrate } from "../../src/db/migrate";
import { insertCase, makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

const insertDocument = (caseId: string, kind: string) =>
  db.query("insert into documents (case_id, kind, filename, raw_text) values ($1, $2, 'f.txt', 'text')", [caseId, kind]);

const insertField = (caseId: string, overrides: Record<string, string> = {}) => {
  const f = { doc_kind: "degree", name: "degree", source: "llm", confidence: "high", status: "pending", ...overrides };
  return db.query(
    "insert into fields (case_id, doc_kind, name, source, confidence, status) values ($1, $2, $3, $4, $5, $6)",
    [caseId, f.doc_kind, f.name, f.source, f.confidence, f.status],
  );
};

describe("migrations", () => {
  it("are idempotent: a second run applies nothing", async () => {
    expect(await migrate(db, "migrations")).toEqual([]);
  });
});

describe("schema", () => {
  it("allows one document per case and kind", async () => {
    const caseId = await insertCase(db);
    await insertDocument(caseId, "passport");
    await expect(insertDocument(caseId, "passport")).rejects.toThrow();
    await insertDocument(caseId, "degree");
  });

  it("rejects an unknown document kind", async () => {
    const caseId = await insertCase(db);
    await expect(insertDocument(caseId, "selfie")).rejects.toThrow();
  });

  it("stores one row per fact and rejects bad status, source and confidence", async () => {
    const caseId = await insertCase(db);
    await insertField(caseId);
    await expect(insertField(caseId)).rejects.toThrow();
    await expect(insertField(caseId, { name: "a", status: "bogus" })).rejects.toThrow();
    await expect(insertField(caseId, { name: "b", source: "guess" })).rejects.toThrow();
    await expect(insertField(caseId, { name: "c", confidence: "medium" })).rejects.toThrow();
  });

  it("defaults a new field to pending", async () => {
    const caseId = await insertCase(db);
    await db.query("insert into fields (case_id, doc_kind, name, source, confidence) values ($1, 'degree', 'x', 'llm', 'low')", [caseId]);
    const { rows } = await db.query<{ status: string }>("select status from fields where case_id = $1", [caseId]);
    expect(rows[0].status).toBe("pending");
  });

  it("deletes documents and fields with their case", async () => {
    const caseId = await insertCase(db);
    await insertDocument(caseId, "offer_letter");
    await insertField(caseId, { doc_kind: "offer_letter", name: "salary" });
    await db.query("delete from cases where id = $1", [caseId]);
    expect((await db.query("select 1 from documents where case_id = $1", [caseId])).rows).toHaveLength(0);
    expect((await db.query("select 1 from fields where case_id = $1", [caseId])).rows).toHaveLength(0);
  });

  it("stores audit detail as json", async () => {
    await db.query("insert into audit_log (action, detail) values ($1, $2::jsonb)", ["test", JSON.stringify({ n: 1 })]);
    const { rows } = await db.query<{ detail: { n: number } }>("select detail from audit_log where action = 'test'");
    expect(rows[0].detail).toEqual({ n: 1 });
  });
});
