import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db";
import type { FieldInput } from "../../src/db/fields";
import {
  caseExists,
  createCase,
  getCaseDetail,
  listCases,
  saveExtraction,
  updateField,
} from "../../src/repo/cases";
import { makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

const f = (name: string, value: string, over: Partial<FieldInput> = {}): FieldInput => ({
  name,
  value,
  quote: value,
  source: "llm",
  confidence: "high",
  ...over,
});
const save = (caseId: string, kind: "passport" | "degree" | "offer_letter", fields: FieldInput[], filename = `${kind}.txt`) =>
  saveExtraction(db, { caseId, kind, filename, rawText: "SECRET RAW TEXT", fields });
const newCase = async () => (await createCase(db, "Doe H-1B")).id;

describe("cases", () => {
  it("creates a case and finds it", async () => {
    const created = await createCase(db, "Doe H-1B");
    expect(created.label).toBe("Doe H-1B");
    expect(await caseExists(db, created.id)).toBe(true);
  });

  it("does not find an unknown or malformed id", async () => {
    expect(await caseExists(db, "00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(await caseExists(db, "not-a-uuid")).toBe(false);
  });
});

describe("saveExtraction", () => {
  it("keeps one document per kind and replaces its fields on re-save", async () => {
    const id = await newCase();
    await save(id, "degree", [f("degree", "BSc"), f("institution", "Old U")], "first.txt");
    await save(id, "degree", [f("degree", "MSc")], "second.txt");

    const detail = await getCaseDetail(db, id);
    expect(detail?.documents).toEqual([{ kind: "degree", filename: "second.txt" }]);
    expect(detail?.fields.map((x) => [x.name, x.value])).toEqual([["degree", "MSc"]]);
  });

  it("is atomic: a failing field insert leaves the previous save intact", async () => {
    const id = await newCase();
    await save(id, "degree", [f("degree", "BSc")], "first.txt");
    await expect(save(id, "degree", [f("a", "1"), f("a", "2")], "second.txt")).rejects.toThrow();

    const detail = await getCaseDetail(db, id);
    expect(detail?.documents).toEqual([{ kind: "degree", filename: "first.txt" }]);
    expect(detail?.fields.map((x) => x.value)).toEqual(["BSc"]);
  });
});

describe("getCaseDetail answers", () => {
  it("returns seeded questionnaire answers", async () => {
    const detail = await getCaseDetail(db, await newCase());
    expect(detail?.answers["offer_letter.annual_salary"]).toBeDefined();
  });
});

describe("listCases", () => {
  it("summarises beneficiary, employer, status and counts", async () => {
    const id = await newCase();
    await save(id, "passport", [f("given_names", "JOHN MICHAEL", { source: "mrz" }), f("surname", "DOE", { source: "mrz" })]);
    await save(id, "offer_letter", [f("name", "John Doe"), f("employer", "Utopia Technologies Inc."), f("duties", "", { confidence: "low" })]);

    const summary = (await listCases(db)).find((c) => c.id === id);
    expect(summary).toEqual({
      id,
      label: "Doe H-1B",
      beneficiary: "JOHN MICHAEL DOE",
      employer: "Utopia Technologies Inc.",
      status: "discrepancy",
      documents: 2,
      lowConfidence: 1,
      caseType: "lottery",
      employerQuestionnaire: "Approved",
      beneficiaryQuestionnaire: "Pending",
      discrepancies: summary?.discrepancies,
      problems: summary?.problems,
    });
    expect(summary?.problems).toBeGreaterThan(0);
  });

  it("is a discrepancy when a problem check fires and fields are still pending", async () => {
    const id = await newCase();
    await save(id, "passport", [f("surname", "DOE", { source: "mrz" }), f("mrz_check_digits", "failed: expiry_date", { source: "mrz" })]);
    const summary = (await listCases(db)).find((c) => c.id === id);
    expect(summary?.status).toBe("discrepancy");
    expect(summary?.problems).toBeGreaterThanOrEqual(1);
    expect(summary?.discrepancies).toBeGreaterThanOrEqual(summary?.problems ?? 0);
  });

  it("is empty with no fields and ready once three documents are fully approved", async () => {
    const id = await newCase();
    expect((await listCases(db)).find((c) => c.id === id)?.status).toBe("empty");

    await save(id, "passport", [f("surname", "DOE", { source: "mrz" })]);
    await save(id, "degree", [f("degree", "BSc")]);
    await save(id, "offer_letter", [f("name", "John Doe")]);
    await db.query("update fields set status = 'approved' where case_id = $1", [id]);

    const summary = (await listCases(db)).find((c) => c.id === id);
    expect(summary?.status).toBe("ready");
    expect(summary?.beneficiary).toBe("DOE");
  });

  it("falls back to the offer-letter name when there is no passport", async () => {
    const id = await newCase();
    await save(id, "offer_letter", [f("name", "John Doe")]);
    expect((await listCases(db)).find((c) => c.id === id)?.beneficiary).toBe("John Doe");
  });
});

describe("getCaseDetail", () => {
  it("returns fields in camelCase and never the raw text", async () => {
    const id = await newCase();
    await save(id, "degree", [f("degree", "BSc", { quote: "Bachelor of Science" })]);

    const detail = await getCaseDetail(db, id);
    expect(detail?.fields[0]).toMatchObject({
      docKind: "degree",
      name: "degree",
      value: "BSc",
      quote: "Bachelor of Science",
      source: "llm",
      confidence: "high",
      status: "pending",
    });
    expect(JSON.stringify(detail)).not.toContain("SECRET RAW TEXT");
  });

  it("returns undefined for an unknown or malformed id", async () => {
    expect(await getCaseDetail(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
    expect(await getCaseDetail(db, "not-a-uuid")).toBeUndefined();
  });
});

describe("updateField", () => {
  async function oneField() {
    const id = await newCase();
    await save(id, "degree", [f("degree", "BSc")]);
    return (await getCaseDetail(db, id))!.fields[0].id;
  }

  it("marks an edit as attorney-sourced and pending", async () => {
    const fieldId = await oneField();
    expect(await updateField(db, fieldId, { value: "MSc" })).toMatchObject({
      value: "MSc",
      source: "attorney",
      status: "pending",
    });
  });

  it("approves without changing the value or source", async () => {
    const fieldId = await oneField();
    expect(await updateField(db, fieldId, { status: "approved" })).toMatchObject({
      value: "BSc",
      source: "llm",
      status: "approved",
    });
  });

  it("lets one request edit and approve", async () => {
    const fieldId = await oneField();
    expect(await updateField(db, fieldId, { value: "PhD", status: "approved" })).toMatchObject({
      value: "PhD",
      source: "attorney",
      status: "approved",
    });
  });

  it("returns undefined for an unknown or malformed id", async () => {
    expect(await updateField(db, "00000000-0000-0000-0000-000000000000", { status: "approved" })).toBeUndefined();
    expect(await updateField(db, "nope", { status: "approved" })).toBeUndefined();
  });
});
