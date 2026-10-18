import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db";
import { checkOutputGate } from "../../src/outputs/gate";
import { createCase, getCaseDetail, updateField } from "../../src/repo/cases";
import { BASE_FIELDS, seedCase } from "../helpers/caseFixture";
import { makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

describe("checkOutputGate", () => {
  it("blocks while a field is pending", async () => {
    const id = await seedCase(db, { approve: true });
    await db.query("update fields set status = 'pending' where id = (select id from fields where case_id = $1 limit 1)", [id]);
    const result = await checkOutputGate(db, id);
    expect(result && "blocked" in result && result.blocked.pending).toBe(1);
    expect(result && "blocked" in result && result.blocked.message).toContain("1 field");
  });

  it("passes when every field is approved and no problem check fires", async () => {
    const id = await seedCase(db, { approve: true });
    const result = await checkOutputGate(db, id);
    expect(result && "detail" in result).toBe(true);
  });

  it("blocks on a problem check even when every field is approved", async () => {
    const offer = BASE_FIELDS.offer_letter.map((x) => (x.name === "annual_salary" ? { ...x, value: "negotiable" } : x));
    const id = await seedCase(db, { approve: true, override: { offer_letter: offer } });
    const result = await checkOutputGate(db, id);
    expect(result && "blocked" in result && result.blocked.problems).toContain("salary");
  });

  it("blocks a case with no fields", async () => {
    const { id } = await createCase(db, "Empty");
    const result = await checkOutputGate(db, id);
    expect(result && "blocked" in result).toBe(true);
  });

  it("blocks again when an approved field is edited", async () => {
    const id = await seedCase(db, { approve: true });
    const detail = await getCaseDetail(db, id);
    const title = detail!.fields.find((x) => x.name === "job_title")!;
    await updateField(db, title.id, { value: "Senior Engineer" });
    const result = await checkOutputGate(db, id);
    expect(result && "blocked" in result && result.blocked.pending).toBe(1);
  });

  it("returns undefined for an unknown or malformed id", async () => {
    expect(await checkOutputGate(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
    expect(await checkOutputGate(db, "nope")).toBeUndefined();
  });
});
