import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db";
import { replaceFields, type FieldInput } from "../../src/db/fields";
import { insertCase, makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

const field = (name: string, value: string, overrides: Partial<FieldInput> = {}): FieldInput => ({
  name,
  value,
  quote: value,
  source: "llm",
  confidence: "high",
  ...overrides,
});

const rows = (caseId: string, docKind: string) =>
  db
    .query<{ name: string; value: string; status: string }>(
      "select name, value, status from fields where case_id = $1 and doc_kind = $2 order by name",
      [caseId, docKind],
    )
    .then((r) => r.rows);

describe("replaceFields", () => {
  it("stores new fields as pending", async () => {
    const caseId = await insertCase(db);
    await replaceFields(db, caseId, "degree", [field("degree", "BSc"), field("institution", "Utopia University")]);
    expect(await rows(caseId, "degree")).toEqual([
      { name: "degree", value: "BSc", status: "pending" },
      { name: "institution", value: "Utopia University", status: "pending" },
    ]);
  });

  it("replaces old fields and resets approval on re-upload", async () => {
    const caseId = await insertCase(db);
    await replaceFields(db, caseId, "degree", [field("degree", "BSc"), field("institution", "Old U")]);
    await db.query("update fields set status = 'approved' where case_id = $1", [caseId]);

    await replaceFields(db, caseId, "degree", [field("degree", "MSc")]);

    expect(await rows(caseId, "degree")).toEqual([{ name: "degree", value: "MSc", status: "pending" }]);
  });

  it("leaves other document kinds untouched", async () => {
    const caseId = await insertCase(db);
    await replaceFields(db, caseId, "offer_letter", [field("salary", "95000")]);
    await db.query("update fields set status = 'approved' where case_id = $1", [caseId]);

    await replaceFields(db, caseId, "degree", [field("degree", "BSc")]);

    expect(await rows(caseId, "offer_letter")).toEqual([{ name: "salary", value: "95000", status: "approved" }]);
  });

  it("works inside an outer transaction", { timeout: 5000 }, async () => {
    const caseId = await insertCase(db);
    await db.transaction(async (tx) => {
      await replaceFields(tx, caseId, "degree", [field("degree", "BSc")]);
    });
    expect(await rows(caseId, "degree")).toEqual([{ name: "degree", value: "BSc", status: "pending" }]);
  });

  it("rolls back the inner replace when the outer transaction fails", { timeout: 5000 }, async () => {
    const caseId = await insertCase(db);
    await expect(
      db.transaction(async (tx) => {
        await replaceFields(tx, caseId, "degree", [field("degree", "BSc")]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await rows(caseId, "degree")).toEqual([]);
  });

  it("rolls back the delete if an insert fails", async () => {
    const caseId = await insertCase(db);
    await replaceFields(db, caseId, "degree", [field("degree", "BSc")]);

    await expect(
      replaceFields(db, caseId, "degree", [field("degree", "MSc"), field("degree", "duplicate name")]),
    ).rejects.toThrow();

    expect(await rows(caseId, "degree")).toEqual([{ name: "degree", value: "BSc", status: "pending" }]);
  });
});
