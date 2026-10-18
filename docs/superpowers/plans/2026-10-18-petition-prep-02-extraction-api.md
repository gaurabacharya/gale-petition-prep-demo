# Petition Prep Extraction Pipeline and API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose native, inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn uploaded documents into stored, reviewable facts: parse the passport locally, extract degree and offer-letter facts through the redacting `LlmClient`, and expose it all through a Hono API.

**Architecture:** A pure-ish pipeline of Effect functions (`extractPassport`, `extractWithModel`, `extractAndStore`) sits on top of the spec 01 layers. A small repository module owns all SQL for cases and fields. A Hono app maps typed pipeline errors to HTTP codes. Everything is tested with the mock provider and PGlite, with no network.

**Tech Stack:** Node 20, TypeScript, Effect 3 (`effect@^3`), Hono + `@hono/node-server`, `pdf-lib` and `unpdf` (PDF text), Vitest, PGlite for tests. Builds on spec 01 (already in the repo).

**Spec:** `docs/superpowers/specs/2026-10-18-petition-prep-02-extraction-api-design.md`. Also read spec 01 and spec 00 (index) in the same folder.

## Global Constraints

- Work directly on `main` in the working tree. **Do not run `git commit`, `git push` or `git merge`.** The user commits themselves. Leave changes uncommitted.
- Effect stays on 3.x (`effect@^3`); the plan uses `Context.Tag`, `Either` and `Schema` from it.
- The passport route never calls `LlmClient`. Passport text is parsed locally with `parseMrz` only.
- Degree and offer-letter text is redacted before the model call and restored after. The model only ever sees tokens for SSN, A-number, email, phone, passport number, date of birth and student ID.
- A value is `high` confidence only if its returned `quote` appears in the document's `raw_text`. Otherwise `low`. A missing value is stored as a `low` field with an empty value.
- Re-uploading a document kind deletes its old fields and writes the new ones with `status = pending`.
- When `DEMO_MODE=true`, a passport whose MRZ issuing country is not `UTO` is rejected before anything is stored or any model call, and the rejection is audited.
- The audit log holds counts, provider and model only, never field values.
- Typed errors map to HTTP codes: invalid request 400, demo-mode rejection 403, case or field not found 404, unreadable MRZ or document 422, model failure or invalid model output 502. Unexpected failures are 500 with a generic message that never includes internal detail.
- Model failure handling is one retry, then a typed error.
- Field names (the contract for specs 03 and 04):
  - passport: `surname`, `given_names`, `passport_number`, `nationality`, `date_of_birth`, `sex`, `expiry_date`, `issuing_country`, `mrz_check_digits`
  - degree: `name`, `degree`, `field_of_study`, `institution`, `date_conferred`
  - offer letter: `name`, `job_title`, `duties`, `annual_salary`, `start_date`, `employer`, `worksite_location`
- Tests that need a database use PGlite via `makeTestDb()` in `test/helpers/testDb.ts`.

## Review Focus

Inputs the spec implies but doesn't spell out. Each has a test in the task that owns the code.

1. **Empty or whitespace-only upload:** a clear 400, never a model call (Task 6).
2. **Model returns valid JSON that omits a field:** 502, and nothing is stored (Tasks 4 and 5).
3. **A quote that differs from the document only by line wrapping or spacing:** still `high` confidence (Task 4).
4. **A scanned or empty-text PDF, or a corrupt PDF:** a clear 422, not a 500 (Task 7).
5. **A malformed case or field id (not a UUID):** 404, not a database error (Tasks 2 and 6).

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/errors.ts` | `UnreadableDocumentError`, `DemoModeRejectedError` |
| `src/repo/cases.ts` | All SQL for cases, documents and fields: create, list, detail, save extraction, update field |
| `src/pipeline/passport.ts` | `extractPassport`: MRZ to fields, plus the demo guard |
| `src/pipeline/schemas.ts` | Effect schemas and key lists for degree and offer-letter extraction |
| `src/pipeline/model.ts` | `extractWithModel`, `extractDegree`, `extractOfferLetter`: redact, call, validate, restore, grade confidence |
| `src/pipeline/extract.ts` | `extractAndStore`: the orchestrator used by the API |
| `src/api/app.ts` | `makeApp`: Hono routes and error mapping |
| `src/api/pdf.ts` | `pdfToText` using `unpdf` |
| `src/server.ts` | Entry point wiring `pg`, config and the app |
| `test/helpers/testDb.ts` | (modify) fix nested transactions |
| `test/helpers/llm.ts` | `makeTestLlm`, canned degree and offer-letter responses |
| `test/fixtures/passport.ts` | `buildMrz`, `demoPassportText` |
| `test/fixtures/degree.ts`, `test/fixtures/offerLetter.ts` | Synthetic documents |
| `test/repo/`, `test/pipeline/`, `test/api/` | Tests mirroring `src/` |

---

### Task 1: Baseline and nested-transaction fix

The pipeline saves a document and its fields in one transaction, and `replaceFields` opens its own. The PGlite test helper currently passes the root database to a nested transaction, which deadlocks. Fix that first.

**Files:**
- Modify: `test/helpers/testDb.ts`
- Test: `test/db/fields.test.ts`

**Interfaces:**
- Consumes: `Db` (`src/db/db.ts`), `replaceFields` (`src/db/fields.ts`)
- Produces: `makeTestDb()` whose `transaction` supports nesting (a nested call joins the outer transaction)

- [ ] **Step 1: Install dependencies and confirm the spec 01 baseline is green**

Run: `npm install && npx vitest run && npm run typecheck`
Expected: 8 test files, 61 tests PASS, and `tsc` prints nothing.

- [ ] **Step 2: Write the failing tests**

Append inside the `describe("replaceFields", ...)` block in `test/db/fields.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/db/fields.test.ts`
Expected: the two new tests FAIL (a timeout after 5000 ms, since the nested call waits on the open transaction).

- [ ] **Step 4: Fix the helper**

In `test/helpers/testDb.ts`, replace the whole `makeTestDb` function with:

```ts
function wrapTransaction(tx: Queryable): Db {
  const inner: Db = adapt(tx, (fn) => fn(inner), async () => {});
  return inner;
}

/** A fresh in-memory Postgres with every migration applied. Nested transactions join the outer one. */
export async function makeTestDb(): Promise<Db> {
  const lite = new PGlite();
  const db: Db = adapt(
    lite,
    (fn) => lite.transaction((tx) => fn(wrapTransaction(tx as unknown as Queryable))),
    () => lite.close(),
  );
  await migrate(db, "migrations");
  return db;
}
```

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: 63 tests PASS and `tsc` prints nothing.

---

### Task 2: Repository module

**Files:**
- Create: `src/repo/cases.ts`
- Test: `test/repo/cases.test.ts`

**Interfaces:**
- Consumes: `Db`, `replaceFields`, `DocKind`, `FieldInput`, `FieldSource`, `Confidence` (spec 01)
- Produces:
  - `isUuid(id: string): boolean`
  - `createCase(db: Db, label: string): Promise<{ id: string; label: string }>`
  - `caseExists(db: Db, id: string): Promise<boolean>` (false for a malformed id)
  - `saveExtraction(db: Db, input: SaveExtractionInput): Promise<void>` where `SaveExtractionInput = { caseId: string; kind: DocKind; filename: string; rawText: string; fields: readonly FieldInput[] }`. It upserts the document and replaces its fields in one transaction.
  - `listCases(db: Db): Promise<CaseSummary[]>` where `CaseSummary = { id; label; beneficiary: string | null; employer: string | null; status: "empty" | "needs_review" | "ready"; documents: number; lowConfidence: number }`
  - `getCaseDetail(db: Db, id: string): Promise<CaseDetail | undefined>` where `CaseDetail = { id; label; documents: { kind: DocKind; filename: string }[]; fields: FieldRow[] }` and `FieldRow = { id; docKind: DocKind; name; value; quote; source: FieldSource; confidence: Confidence; status: "pending" | "approved" }`. It never returns `raw_text`.
  - `updateField(db: Db, id: string, patch: { value?: string; status?: "pending" | "approved" }): Promise<FieldRow | undefined>`

`CaseSummary.lowConfidence` counts low-confidence fields. Spec 03's checks replace it with a real discrepancy count. `status` is `empty` with no fields, `needs_review` while any field is pending or fewer than 3 documents exist, and `ready` otherwise.

- [ ] **Step 1: Write the failing tests**

`test/repo/cases.test.ts`:

```ts
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
const newCase = async () => (await createCase(db, "Eriksson H-1B")).id;

describe("cases", () => {
  it("creates a case and finds it", async () => {
    const created = await createCase(db, "Eriksson H-1B");
    expect(created.label).toBe("Eriksson H-1B");
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

describe("listCases", () => {
  it("summarises beneficiary, employer, status and counts", async () => {
    const id = await newCase();
    await save(id, "passport", [f("given_names", "ANNA MARIA", { source: "mrz" }), f("surname", "ERIKSSON", { source: "mrz" })]);
    await save(id, "offer_letter", [f("name", "Anna Eriksson"), f("employer", "Utopia Technologies Inc."), f("duties", "", { confidence: "low" })]);

    const summary = (await listCases(db)).find((c) => c.id === id);
    expect(summary).toEqual({
      id,
      label: "Eriksson H-1B",
      beneficiary: "ANNA MARIA ERIKSSON",
      employer: "Utopia Technologies Inc.",
      status: "needs_review",
      documents: 2,
      lowConfidence: 1,
    });
  });

  it("is empty with no fields and ready once three documents are fully approved", async () => {
    const id = await newCase();
    expect((await listCases(db)).find((c) => c.id === id)?.status).toBe("empty");

    await save(id, "passport", [f("surname", "ERIKSSON", { source: "mrz" })]);
    await save(id, "degree", [f("degree", "BSc")]);
    await save(id, "offer_letter", [f("name", "Anna Eriksson")]);
    await db.query("update fields set status = 'approved' where case_id = $1", [id]);

    const summary = (await listCases(db)).find((c) => c.id === id);
    expect(summary?.status).toBe("ready");
    expect(summary?.beneficiary).toBe("ERIKSSON");
  });

  it("falls back to the offer-letter name when there is no passport", async () => {
    const id = await newCase();
    await save(id, "offer_letter", [f("name", "Anna Eriksson")]);
    expect((await listCases(db)).find((c) => c.id === id)?.beneficiary).toBe("Anna Eriksson");
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/repo`
Expected: FAIL with "Failed to resolve import ../../src/repo/cases".

- [ ] **Step 3: Implement the repository**

`src/repo/cases.ts`:

```ts
import type { Db } from "../db/db";
import {
  replaceFields,
  type Confidence,
  type DocKind,
  type FieldInput,
  type FieldSource,
} from "../db/fields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string): boolean => UUID.test(id);

export interface FieldRow {
  readonly id: string;
  readonly docKind: DocKind;
  readonly name: string;
  readonly value: string;
  readonly quote: string;
  readonly source: FieldSource;
  readonly confidence: Confidence;
  readonly status: "pending" | "approved";
}

export interface CaseSummary {
  readonly id: string;
  readonly label: string;
  readonly beneficiary: string | null;
  readonly employer: string | null;
  readonly status: "empty" | "needs_review" | "ready";
  readonly documents: number;
  readonly lowConfidence: number;
}

export interface CaseDetail {
  readonly id: string;
  readonly label: string;
  readonly documents: readonly { kind: DocKind; filename: string }[];
  readonly fields: readonly FieldRow[];
}

export interface SaveExtractionInput {
  readonly caseId: string;
  readonly kind: DocKind;
  readonly filename: string;
  readonly rawText: string;
  readonly fields: readonly FieldInput[];
}

interface FieldDbRow {
  id: string;
  doc_kind: DocKind;
  name: string;
  value: string;
  quote: string;
  source: FieldSource;
  confidence: Confidence;
  status: "pending" | "approved";
}

const FIELD_COLUMNS = "id, doc_kind, name, value, quote, source, confidence, status";

const toFieldRow = (r: FieldDbRow): FieldRow => ({
  id: r.id,
  docKind: r.doc_kind,
  name: r.name,
  value: r.value,
  quote: r.quote,
  source: r.source,
  confidence: r.confidence,
  status: r.status,
});

export async function createCase(db: Db, label: string): Promise<{ id: string; label: string }> {
  const { rows } = await db.query<{ id: string; label: string }>(
    "insert into cases (label) values ($1) returning id, label",
    [label],
  );
  return rows[0];
}

export async function caseExists(db: Db, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return (await db.query("select 1 from cases where id = $1", [id])).rows.length > 0;
}

/** Upserts the document and replaces its fields, all or nothing. */
export async function saveExtraction(db: Db, input: SaveExtractionInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into documents (case_id, kind, filename, raw_text) values ($1, $2, $3, $4)
       on conflict (case_id, kind) do update set filename = excluded.filename, raw_text = excluded.raw_text`,
      [input.caseId, input.kind, input.filename, input.rawText],
    );
    await replaceFields(tx, input.caseId, input.kind, input.fields);
  });
}

const fieldValue = (docKind: string, name: string) =>
  `(select value from fields f where f.case_id = c.id and f.doc_kind = '${docKind}' and f.name = '${name}')`;

const LIST_SQL = `
  select c.id, c.label,
    (select count(*) from documents d where d.case_id = c.id)::int as documents,
    (select count(*) from fields f where f.case_id = c.id)::int as total_fields,
    (select count(*) from fields f where f.case_id = c.id and f.status = 'pending')::int as pending_fields,
    (select count(*) from fields f where f.case_id = c.id and f.confidence = 'low')::int as low_confidence,
    ${fieldValue("passport", "given_names")} as given_names,
    ${fieldValue("passport", "surname")} as surname,
    ${fieldValue("offer_letter", "name")} as offer_name,
    ${fieldValue("offer_letter", "employer")} as employer
  from cases c
  order by c.created_at desc, c.id`;

interface ListRow {
  id: string;
  label: string;
  documents: number;
  total_fields: number;
  pending_fields: number;
  low_confidence: number;
  given_names: string | null;
  surname: string | null;
  offer_name: string | null;
  employer: string | null;
}

export async function listCases(db: Db): Promise<CaseSummary[]> {
  const { rows } = await db.query<ListRow>(LIST_SQL);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    beneficiary: [r.given_names, r.surname].filter(Boolean).join(" ") || r.offer_name || null,
    employer: r.employer,
    status:
      r.total_fields === 0 ? "empty" : r.pending_fields > 0 || r.documents < 3 ? "needs_review" : "ready",
    documents: r.documents,
    lowConfidence: r.low_confidence,
  }));
}

export async function getCaseDetail(db: Db, id: string): Promise<CaseDetail | undefined> {
  if (!isUuid(id)) return undefined;
  const found = await db.query<{ id: string; label: string }>("select id, label from cases where id = $1", [id]);
  if (found.rows.length === 0) return undefined;
  const documents = await db.query<{ kind: DocKind; filename: string }>(
    "select kind, filename from documents where case_id = $1 order by kind",
    [id],
  );
  const fields = await db.query<FieldDbRow>(
    `select ${FIELD_COLUMNS} from fields where case_id = $1 order by doc_kind, name`,
    [id],
  );
  return { ...found.rows[0], documents: documents.rows, fields: fields.rows.map(toFieldRow) };
}

/** An edit marks the field attorney-sourced and pending, unless the same request also sets a status. */
export async function updateField(
  db: Db,
  id: string,
  patch: { readonly value?: string; readonly status?: "pending" | "approved" },
): Promise<FieldRow | undefined> {
  if (!isUuid(id)) return undefined;
  const { rows } = await db.query<FieldDbRow>(
    `update fields set
       value = coalesce($2::text, value),
       source = case when $2::text is not null then 'attorney' else source end,
       status = coalesce($3::text, case when $2::text is not null then 'pending' else status end)
     where id = $1
     returning ${FIELD_COLUMNS}`,
    [id, patch.value ?? null, patch.status ?? null],
  );
  return rows[0] ? toFieldRow(rows[0]) : undefined;
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run test/repo && npm run typecheck`
Expected: all repository tests PASS and `tsc` prints nothing.

---

### Task 3: Passport extraction and demo guard

**Files:**
- Create: `src/errors.ts`, `src/pipeline/passport.ts`
- Create: `test/fixtures/passport.ts`
- Test: `test/pipeline/passport.test.ts`

**Interfaces:**
- Consumes: `parseMrz`, `checkDigit`, `MrzField` (`src/privacy/mrz.ts`), `FieldInput` (`src/db/fields.ts`)
- Produces:
  - `class UnreadableDocumentError extends Data.TaggedError("UnreadableDocumentError")<{ message: string }>`
  - `class DemoModeRejectedError extends Data.TaggedError("DemoModeRejectedError")<{ message: string }>`
  - `extractPassport(text: string, opts: { demoMode: boolean }): Effect.Effect<FieldInput[], UnreadableDocumentError | DemoModeRejectedError>`
  - Fixtures: `buildMrz(spec: PassportSpec): [string, string]`, `demoPassportText(over?: Partial<PassportSpec>): string`

The `mrz_check_digits` field is `ok` when every digit passes, otherwise `failed: ` followed by the failing checks (`passport_number`, `date_of_birth`, `expiry_date`, `composite`) separated by commas. Spec 03 reads it.

- [ ] **Step 1: Write the fixture**

`test/fixtures/passport.ts` (the demo passport expires 2027-01-15, close to the demo offer letter's October 1, 2026 start date):

```ts
import { checkDigit } from "../../src/privacy/mrz";

export interface PassportSpec {
  country: string;
  surname: string;
  given: string;
  number: string;
  dob: string;
  sex: "F" | "M";
  expiry: string;
}

const DEMO: PassportSpec = {
  country: "UTO",
  surname: "ERIKSSON",
  given: "ANNA MARIA",
  number: "L898902C3",
  dob: "940812",
  sex: "F",
  expiry: "270115",
};

/** Builds a TD3 MRZ with correct ICAO check digits. */
export function buildMrz(p: PassportSpec): [string, string] {
  const line1 = `P<${p.country}${p.surname}<<${p.given.replace(/ /g, "<")}`.padEnd(44, "<");
  const number = p.number.padEnd(9, "<");
  const personal = "".padEnd(14, "<");
  const head =
    `${number}${checkDigit(number)}${p.country}${p.dob}${checkDigit(p.dob)}${p.sex}` +
    `${p.expiry}${checkDigit(p.expiry)}${personal}${checkDigit(personal)}`;
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 43);
  return [line1, head + checkDigit(composite)];
}

export function demoPassportText(over: Partial<PassportSpec> = {}): string {
  const [l1, l2] = buildMrz({ ...DEMO, ...over });
  return ["REPUBLIC OF UTOPIA", "PASSPORT", l1, l2].join("\n");
}
```

- [ ] **Step 2: Write the failing tests**

`test/pipeline/passport.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { extractPassport } from "../../src/pipeline/passport";
import { demoPassportText } from "../fixtures/passport";

const run = (text: string, demoMode: boolean) => Effect.runPromise(Effect.either(extractPassport(text, { demoMode })));

describe("extractPassport", () => {
  it("returns every passport field as high-confidence MRZ data", async () => {
    const result = await run(demoPassportText(), true);
    if (result._tag === "Left") throw new Error(result.left.message);
    const byName = Object.fromEntries(result.right.map((f) => [f.name, f]));

    expect(Object.keys(byName)).toEqual([
      "surname",
      "given_names",
      "passport_number",
      "nationality",
      "date_of_birth",
      "sex",
      "expiry_date",
      "issuing_country",
      "mrz_check_digits",
    ]);
    expect(byName.surname.value).toBe("ERIKSSON");
    expect(byName.given_names.value).toBe("ANNA MARIA");
    expect(byName.passport_number.value).toBe("L898902C3");
    expect(byName.nationality.value).toBe("UTO");
    expect(byName.date_of_birth.value).toBe("1994-08-12");
    expect(byName.date_of_birth.quote).toBe("940812");
    expect(byName.sex.value).toBe("F");
    expect(byName.expiry_date.value).toBe("2027-01-15");
    expect(byName.issuing_country.value).toBe("UTO");
    expect(byName.mrz_check_digits.value).toBe("ok");
    for (const f of result.right) {
      expect(f.source).toBe("mrz");
      expect(f.confidence).toBe("high");
    }
  });

  it("names the failing check digits", async () => {
    const result = await run(demoPassportText().replace("L898902C3", "L898903C3"), true);
    if (result._tag === "Left") throw new Error(result.left.message);
    expect(result.right.find((f) => f.name === "mrz_check_digits")?.value).toBe("failed: passport_number, composite");
  });

  it("rejects a non-UTO passport in demo mode", async () => {
    const result = await run(demoPassportText({ country: "USA" }), true);
    expect(result._tag === "Left" && result.left._tag).toBe("DemoModeRejectedError");
  });

  it("accepts a non-UTO passport outside demo mode", async () => {
    const result = await run(demoPassportText({ country: "USA" }), false);
    expect(result._tag).toBe("Right");
  });

  it("returns UnreadableDocumentError when there is no MRZ", async () => {
    const result = await run("Just a scanned page with no machine-readable zone", true);
    expect(result._tag === "Left" && result.left._tag).toBe("UnreadableDocumentError");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/pipeline/passport.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/pipeline/passport".

- [ ] **Step 4: Implement the errors and the extractor**

`src/errors.ts`:

```ts
import { Data } from "effect";

export class UnreadableDocumentError extends Data.TaggedError("UnreadableDocumentError")<{
  readonly message: string;
}> {}

export class DemoModeRejectedError extends Data.TaggedError("DemoModeRejectedError")<{
  readonly message: string;
}> {}
```

`src/pipeline/passport.ts`:

```ts
import { Effect, Either } from "effect";
import type { FieldInput } from "../db/fields";
import { DemoModeRejectedError, UnreadableDocumentError } from "../errors";
import { parseMrz, type MrzChecks, type MrzField } from "../privacy/mrz";

const CHECK_NAMES: Record<keyof MrzChecks, string> = {
  passportNumber: "passport_number",
  dateOfBirth: "date_of_birth",
  expiryDate: "expiry_date",
  composite: "composite",
};

const mrzField = (name: string, f: MrzField): FieldInput => ({
  name,
  value: f.value,
  quote: f.source,
  source: "mrz",
  confidence: "high",
});

function checkDigitsField(checks: MrzChecks): FieldInput {
  const failed = (Object.keys(CHECK_NAMES) as (keyof MrzChecks)[]).filter((k) => !checks[k]).map((k) => CHECK_NAMES[k]);
  return {
    name: "mrz_check_digits",
    value: failed.length === 0 ? "ok" : `failed: ${failed.join(", ")}`,
    quote: "",
    source: "mrz",
    confidence: "high",
  };
}

/** Local only: the passport text never reaches a model. */
export function extractPassport(
  text: string,
  opts: { readonly demoMode: boolean },
): Effect.Effect<FieldInput[], UnreadableDocumentError | DemoModeRejectedError> {
  const parsed = parseMrz(text);
  if (Either.isLeft(parsed)) return Effect.fail(new UnreadableDocumentError({ message: parsed.left.message }));
  const r = parsed.right;
  if (opts.demoMode && r.issuingCountry.value !== "UTO") {
    return Effect.fail(new DemoModeRejectedError({ message: "Demo mode accepts only synthetic UTO specimen passports" }));
  }
  return Effect.succeed([
    mrzField("surname", r.surname),
    mrzField("given_names", r.givenNames),
    mrzField("passport_number", r.passportNumber),
    mrzField("nationality", r.nationality),
    mrzField("date_of_birth", r.dateOfBirth),
    mrzField("sex", r.sex),
    mrzField("expiry_date", r.expiryDate),
    mrzField("issuing_country", r.issuingCountry),
    checkDigitsField(r.checks),
  ]);
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run test/pipeline/passport.test.ts && npm run typecheck`
Expected: all 5 tests PASS and `tsc` prints nothing.

---

### Task 4: Model extraction for degree and offer letter

**Files:**
- Create: `src/pipeline/schemas.ts`, `src/pipeline/model.ts`
- Create: `test/helpers/llm.ts`, `test/fixtures/degree.ts`, `test/fixtures/offerLetter.ts`
- Test: `test/pipeline/model.test.ts`

**Interfaces:**
- Consumes: `LlmClient`, `LlmProviderError`, `LlmInvalidOutputError` (`src/llm/LlmClient.ts`), `redact`, `restore` (`src/privacy/redact.ts`), `FieldInput`, `makeMockProvider`/`MockCall` (`src/llm/mock.ts`), `makeLlmClientLayer`, `makeMemoryAuditLog`
- Produces:
  - `DegreeExtraction`, `OfferLetterExtraction` (Effect `Schema.Struct`s whose members are `{ value: string; quote: string }`), `DEGREE_KEYS`, `OFFER_LETTER_KEYS`
  - `quoteAppears(quote: string, text: string): boolean` (whitespace-normalised containment)
  - `extractWithModel(schema, keys, text): Effect.Effect<FieldInput[], LlmProviderError | LlmInvalidOutputError, LlmClient>`
  - `extractDegree(text)`, `extractOfferLetter(text)`: the two bindings of `extractWithModel`
  - Test helpers: `makeTestLlm(respond)` returning `{ layer, calls, entries }`, `respondByDocument`, `DEGREE_RESPONSE`, `OFFER_RESPONSE`, `DEGREE_TEXT`, `OFFER_LETTER_TEXT`

- [ ] **Step 1: Write the fixtures and helpers**

`test/fixtures/degree.ts` (the name is missing the middle name on purpose):

```ts
export const DEGREE_TEXT = [
  "UTOPIA UNIVERSITY",
  "This certifies that",
  "Anna Eriksson",
  "has been awarded the degree of",
  "Bachelor of Science in Computer Science",
  "Conferred on May 20, 2012",
  "Student ID: S2008-4471",
].join("\n");
```

`test/fixtures/offerLetter.ts`:

```ts
export const OFFER_LETTER_TEXT = [
  "Utopia Technologies Inc.",
  "Offer of Employment",
  "",
  "Dear Anna Eriksson,",
  "",
  "We are pleased to offer you the position of Software Engineer.",
  "Your duties will include designing and building backend services.",
  "Your annual salary will be $95,000.",
  "Your start date will be October 1, 2026.",
  "Your worksite will be 100 Main Street, Springfield.",
  "",
  "Contact: hr@utopiatech.example or (212) 555-0147.",
  "Your SSN on file is 123-45-6789.",
].join("\n");
```

`test/helpers/llm.ts`:

```ts
import { Layer } from "effect";
import { makeMemoryAuditLog } from "../../src/audit/audit";
import { makeLlmClientLayer } from "../../src/llm/LlmClient";
import { makeMockProvider, type MockCall } from "../../src/llm/mock";

/** A mock-backed LlmClient plus an in-memory AuditLog, merged so tests can provide both. */
export function makeTestLlm(respond: (call: MockCall) => string | object) {
  const mock = makeMockProvider(respond);
  const audit = makeMemoryAuditLog();
  const layer = Layer.merge(audit.layer, makeLlmClientLayer(mock.provider).pipe(Layer.provide(audit.layer)));
  return { layer, calls: mock.calls, entries: audit.entries };
}

const x = (value: string, quote = value) => ({ value, quote });

export const DEGREE_RESPONSE = {
  name: x("Anna Eriksson"),
  degree: x("Bachelor of Science", "Bachelor of Science in Computer Science"),
  field_of_study: x("Computer Science", "Bachelor of Science in Computer Science"),
  institution: x("Utopia University", "UTOPIA UNIVERSITY"),
  date_conferred: x("May 20, 2012", "Conferred on May 20, 2012"),
};

export const OFFER_RESPONSE = {
  name: x("Anna Eriksson", "Dear Anna Eriksson"),
  job_title: x("Software Engineer", "the position of Software Engineer"),
  duties: x("designing and building backend services"),
  annual_salary: x("$95,000", "Your annual salary will be $95,000"),
  start_date: x("October 1, 2026", "Your start date will be October 1, 2026"),
  employer: x("Utopia Technologies Inc."),
  worksite_location: x("100 Main Street, Springfield", "Your worksite will be 100 Main Street, Springfield"),
};

/** Only the degree prompt lists `field_of_study`. */
export const respondByDocument = (call: MockCall) =>
  call.prompt.includes("field_of_study") ? DEGREE_RESPONSE : OFFER_RESPONSE;
```

- [ ] **Step 2: Write the failing tests**

`test/pipeline/model.test.ts`:

```ts
import { Effect, type Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { AuditLog } from "../../src/audit/audit";
import type { LlmClient } from "../../src/llm/LlmClient";
import { extractDegree, extractOfferLetter, quoteAppears } from "../../src/pipeline/model";
import { DEGREE_TEXT } from "../fixtures/degree";
import { OFFER_LETTER_TEXT } from "../fixtures/offerLetter";
import { DEGREE_RESPONSE, OFFER_RESPONSE, makeTestLlm } from "../helpers/llm";

type Layers = Layer.Layer<LlmClient | AuditLog>;
const run = <A, E>(effect: Effect.Effect<A, E, LlmClient>, layer: Layers) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.either));
const byName = <T extends { name: string }>(fields: T[]) => Object.fromEntries(fields.map((f) => [f.name, f]));

describe("quoteAppears", () => {
  it("ignores line wrapping and extra spacing", () => {
    expect(quoteAppears("Bachelor of Science\n  in Computer Science", DEGREE_TEXT)).toBe(true);
  });
  it("is false for an empty or invented quote", () => {
    expect(quoteAppears("", DEGREE_TEXT)).toBe(false);
    expect(quoteAppears("Doctor of Philosophy", DEGREE_TEXT)).toBe(false);
  });
});

describe("extractDegree", () => {
  it("returns every degree field in order, graded high when the quote is in the document", async () => {
    const { layer } = makeTestLlm(() => DEGREE_RESPONSE);
    const result = await run(extractDegree(DEGREE_TEXT), layer);
    if (result._tag === "Left") throw new Error(result.left.message);

    expect(result.right.map((f) => f.name)).toEqual(["name", "degree", "field_of_study", "institution", "date_conferred"]);
    const f = byName(result.right);
    expect(f.name).toMatchObject({ value: "Anna Eriksson", quote: "Anna Eriksson", source: "llm", confidence: "high" });
    expect(f.institution).toMatchObject({ value: "Utopia University", quote: "UTOPIA UNIVERSITY", confidence: "high" });
  });

  it("grades a quote that is not in the document as low", async () => {
    const { layer } = makeTestLlm(() => ({ ...DEGREE_RESPONSE, degree: { value: "PhD", quote: "Doctor of Philosophy" } }));
    const result = await run(extractDegree(DEGREE_TEXT), layer);
    if (result._tag === "Left") throw new Error(result.left.message);
    expect(byName(result.right).degree).toMatchObject({ value: "PhD", confidence: "low" });
  });

  it("stores a missing value as a low-confidence empty field", async () => {
    const { layer } = makeTestLlm(() => ({ ...DEGREE_RESPONSE, date_conferred: { value: "", quote: "" } }));
    const result = await run(extractDegree(DEGREE_TEXT), layer);
    if (result._tag === "Left") throw new Error(result.left.message);
    expect(byName(result.right).date_conferred).toMatchObject({ value: "", quote: "", confidence: "low" });
  });

  it("keeps high confidence when the quote differs only by line wrapping", async () => {
    const { layer } = makeTestLlm(() => ({
      ...DEGREE_RESPONSE,
      degree: { value: "Bachelor of Science", quote: "Bachelor  of Science\nin Computer Science" },
    }));
    const result = await run(extractDegree(DEGREE_TEXT), layer);
    if (result._tag === "Left") throw new Error(result.left.message);
    expect(byName(result.right).degree.confidence).toBe("high");
  });

  it("fails with LlmInvalidOutputError when the model omits a field", async () => {
    const { name: _omitted, ...withoutName } = DEGREE_RESPONSE;
    const { layer } = makeTestLlm(() => withoutName);
    const result = await run(extractDegree(DEGREE_TEXT), layer);
    expect(result._tag === "Left" && result.left._tag).toBe("LlmInvalidOutputError");
  });
});

describe("extractOfferLetter", () => {
  it("returns every offer-letter field", async () => {
    const { layer } = makeTestLlm(() => OFFER_RESPONSE);
    const result = await run(extractOfferLetter(OFFER_LETTER_TEXT), layer);
    if (result._tag === "Left") throw new Error(result.left.message);
    expect(result.right.map((f) => f.name)).toEqual([
      "name",
      "job_title",
      "duties",
      "annual_salary",
      "start_date",
      "employer",
      "worksite_location",
    ]);
    expect(result.right.every((f) => f.confidence === "high")).toBe(true);
    expect(byName(result.right).annual_salary.value).toBe("$95,000");
  });

  it("sends tokens, never the original sensitive values", async () => {
    const { layer, calls } = makeTestLlm(() => OFFER_RESPONSE);
    await run(extractOfferLetter(OFFER_LETTER_TEXT), layer);
    expect(calls).toHaveLength(1);
    const prompt = calls[0].prompt;
    for (const secret of ["123-45-6789", "hr@utopiatech.example", "(212) 555-0147"]) expect(prompt).not.toContain(secret);
    for (const token of ["[[SSN_1]]", "[[EMAIL_1]]", "[[PHONE_1]]"]) expect(prompt).toContain(token);
  });

  it("restores tokens in the model's value and quote", async () => {
    const { layer } = makeTestLlm(() => ({
      ...OFFER_RESPONSE,
      annual_salary: { value: "[[SSN_1]]", quote: "Your SSN on file is [[SSN_1]]" },
    }));
    const result = await run(extractOfferLetter(OFFER_LETTER_TEXT), layer);
    if (result._tag === "Left") throw new Error(result.left.message);
    expect(byName(result.right).annual_salary).toMatchObject({
      value: "123-45-6789",
      quote: "Your SSN on file is 123-45-6789",
      confidence: "high",
    });
  });

  it("audits redaction counts and no values", async () => {
    const { layer, entries } = makeTestLlm(() => OFFER_RESPONSE);
    await run(extractOfferLetter(OFFER_LETTER_TEXT), layer);
    expect(entries).toEqual([
      { action: "llm_call", detail: { provider: "mock", model: "mock", redactions: { SSN: 1, EMAIL: 1, PHONE: 1 } } },
    ]);
  });

  it("retries once, then succeeds", async () => {
    let n = 0;
    const { layer, calls } = makeTestLlm(() => (++n === 1 ? "not json" : OFFER_RESPONSE));
    const result = await run(extractOfferLetter(OFFER_LETTER_TEXT), layer);
    expect(result._tag).toBe("Right");
    expect(calls).toHaveLength(2);
  });

  it("retries once, then returns the typed error", async () => {
    const { layer, calls } = makeTestLlm(() => "still not json");
    const result = await run(extractOfferLetter(OFFER_LETTER_TEXT), layer);
    expect(result._tag === "Left" && result.left._tag).toBe("LlmInvalidOutputError");
    expect(calls).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/pipeline/model.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/pipeline/model".

- [ ] **Step 4: Implement the schemas and the extractor**

`src/pipeline/schemas.ts`:

```ts
import { Schema } from "effect";

const Extracted = Schema.Struct({ value: Schema.String, quote: Schema.String });

export const DegreeExtraction = Schema.Struct({
  name: Extracted,
  degree: Extracted,
  field_of_study: Extracted,
  institution: Extracted,
  date_conferred: Extracted,
});
export const DEGREE_KEYS = ["name", "degree", "field_of_study", "institution", "date_conferred"] as const;

export const OfferLetterExtraction = Schema.Struct({
  name: Extracted,
  job_title: Extracted,
  duties: Extracted,
  annual_salary: Extracted,
  start_date: Extracted,
  employer: Extracted,
  worksite_location: Extracted,
});
export const OFFER_LETTER_KEYS = [
  "name",
  "job_title",
  "duties",
  "annual_salary",
  "start_date",
  "employer",
  "worksite_location",
] as const;
```

`src/pipeline/model.ts`:

```ts
import { Effect, type Schema } from "effect";
import type { FieldInput } from "../db/fields";
import { LlmClient, type LlmInvalidOutputError, type LlmProviderError } from "../llm/LlmClient";
import { redact, restore } from "../privacy/redact";
import { DEGREE_KEYS, DegreeExtraction, OFFER_LETTER_KEYS, OfferLetterExtraction } from "./schemas";

type Extracted = { readonly value: string; readonly quote: string };

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

/** True when the quote appears in the text, ignoring line wrapping and extra spacing. */
export const quoteAppears = (quote: string, text: string): boolean => {
  const q = normalise(quote);
  return q.length > 0 && normalise(text).includes(q);
};

function buildPrompt(keys: readonly string[], redactedText: string): string {
  return [
    "Extract the following fields from the document below.",
    'For each field return {"value": "...", "quote": "..."}, where quote is the exact text from the document that supports the value.',
    "If a field is not in the document, return empty strings for both value and quote.",
    `Fields: ${keys.join(", ")}`,
    "Return one JSON object with exactly these keys.",
    "",
    "<document>",
    redactedText,
    "</document>",
  ].join("\n");
}

/** Redact, call the model, validate, restore tokens, then grade each value against the original text. */
export function extractWithModel<A extends Record<string, Extracted>, I>(
  schema: Schema.Schema<A, I>,
  keys: readonly (keyof A & string)[],
  text: string,
): Effect.Effect<FieldInput[], LlmProviderError | LlmInvalidOutputError, LlmClient> {
  return Effect.gen(function* () {
    const llm = yield* LlmClient;
    const { text: redacted, vault, counts } = redact(text);
    const result = yield* llm
      .complete({ prompt: buildPrompt(keys, redacted), schema, redactions: counts })
      .pipe(Effect.retry({ times: 1 }));
    return keys.map((key): FieldInput => {
      const value = restore(result[key].value, vault);
      const quote = restore(result[key].quote, vault);
      const found = value.trim() !== "" && quoteAppears(quote, text);
      return { name: key, value, quote, source: "llm", confidence: found ? "high" : "low" };
    });
  });
}

export const extractDegree = (text: string) => extractWithModel(DegreeExtraction, DEGREE_KEYS, text);
export const extractOfferLetter = (text: string) => extractWithModel(OfferLetterExtraction, OFFER_LETTER_KEYS, text);
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run test/pipeline/model.test.ts && npm run typecheck`
Expected: all model tests PASS and `tsc` prints nothing. If the generic constraint on `extractWithModel` fails to typecheck against the `Schema.Struct` types, loosen only that constraint (for example to `Record<string, any>` with a local cast on `result[key]`), not the tests.

---

### Task 5: Orchestrator `extractAndStore`

**Files:**
- Create: `src/pipeline/extract.ts`
- Test: `test/pipeline/extract.test.ts`

**Interfaces:**
- Consumes: `extractPassport` (Task 3), `extractDegree`, `extractOfferLetter` (Task 4), `saveExtraction` (Task 2), `AuditLog` (spec 01), `LlmClient`, error classes
- Produces:
  - `type ExtractionError = UnreadableDocumentError | DemoModeRejectedError | LlmProviderError | LlmInvalidOutputError`
  - `interface ExtractInput { caseId: string; kind: DocKind; filename: string; text: string }`
  - `interface ExtractionSummary { kind: DocKind; fields: number; lowConfidence: number }`
  - `extractAndStore(db: Db, opts: { demoMode: boolean }, input: ExtractInput): Effect.Effect<ExtractionSummary, ExtractionError, LlmClient | AuditLog>`

Nothing is stored unless extraction fully succeeds. A database failure is a defect (it becomes a 500 at the API).

- [ ] **Step 1: Write the failing tests**

`test/pipeline/extract.test.ts`:

```ts
import { Effect, type Layer } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuditLog } from "../../src/audit/audit";
import type { Db } from "../../src/db/db";
import type { LlmClient } from "../../src/llm/LlmClient";
import { extractAndStore, type ExtractInput } from "../../src/pipeline/extract";
import { createCase, getCaseDetail } from "../../src/repo/cases";
import { DEGREE_TEXT } from "../fixtures/degree";
import { OFFER_LETTER_TEXT } from "../fixtures/offerLetter";
import { demoPassportText } from "../fixtures/passport";
import { DEGREE_RESPONSE, makeTestLlm, respondByDocument } from "../helpers/llm";
import { makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

const newCase = async () => (await createCase(db, "Eriksson H-1B")).id;
const upload = (layer: Layer.Layer<LlmClient | AuditLog>, input: ExtractInput, demoMode = true) =>
  Effect.runPromise(extractAndStore(db, { demoMode }, input).pipe(Effect.provide(layer), Effect.either));
const input = (caseId: string, kind: ExtractInput["kind"], text: string, filename = `${kind}.txt`): ExtractInput => ({
  caseId,
  kind,
  filename,
  text,
});

describe("extractAndStore", () => {
  it("stores all three documents with their fields", async () => {
    const { layer } = makeTestLlm(respondByDocument);
    const id = await newCase();

    const passport = await upload(layer, input(id, "passport", demoPassportText()));
    const degree = await upload(layer, input(id, "degree", DEGREE_TEXT));
    const offer = await upload(layer, input(id, "offer_letter", OFFER_LETTER_TEXT));

    expect(passport._tag === "Right" && passport.right).toEqual({ kind: "passport", fields: 9, lowConfidence: 0 });
    expect(degree._tag === "Right" && degree.right).toEqual({ kind: "degree", fields: 5, lowConfidence: 0 });
    expect(offer._tag === "Right" && offer.right).toEqual({ kind: "offer_letter", fields: 7, lowConfidence: 0 });

    const detail = await getCaseDetail(db, id);
    expect(detail?.documents.map((d) => d.kind)).toEqual(["degree", "offer_letter", "passport"]);
    expect(detail?.fields).toHaveLength(21);
  });

  it("never calls the model for a passport", async () => {
    const { layer, calls } = makeTestLlm(() => {
      throw new Error("model must not be called for a passport");
    });
    const result = await upload(layer, input(await newCase(), "passport", demoPassportText()));
    expect(result._tag).toBe("Right");
    expect(calls).toHaveLength(0);
  });

  it("counts low-confidence fields", async () => {
    const { layer } = makeTestLlm(() => ({ ...DEGREE_RESPONSE, degree: { value: "PhD", quote: "invented quote" } }));
    const result = await upload(layer, input(await newCase(), "degree", DEGREE_TEXT));
    expect(result._tag === "Right" && result.right.lowConfidence).toBe(1);
  });

  it("replaces fields and resets approval on re-upload, leaving other documents alone", async () => {
    const id = await newCase();
    const first = makeTestLlm(respondByDocument);
    await upload(first.layer, input(id, "degree", DEGREE_TEXT, "first.txt"));
    await upload(first.layer, input(id, "offer_letter", OFFER_LETTER_TEXT));
    await db.query("update fields set status = 'approved' where case_id = $1", [id]);

    const second = makeTextLlmWithDegree({ ...DEGREE_RESPONSE, degree: { value: "Master of Science", quote: "Bachelor of Science in Computer Science" } });
    await upload(second.layer, input(id, "degree", DEGREE_TEXT, "second.txt"));

    const detail = await getCaseDetail(db, id);
    expect(detail?.documents.filter((d) => d.kind === "degree")).toEqual([{ kind: "degree", filename: "second.txt" }]);
    const degreeFields = detail!.fields.filter((x) => x.docKind === "degree");
    expect(degreeFields.every((x) => x.status === "pending")).toBe(true);
    expect(degreeFields.find((x) => x.name === "degree")?.value).toBe("Master of Science");
    expect(detail!.fields.filter((x) => x.docKind === "offer_letter").every((x) => x.status === "approved")).toBe(true);
  });

  it("stores nothing when the model output is invalid", async () => {
    const id = await newCase();
    const { layer } = makeTestLlm(() => "garbage");
    const result = await upload(layer, input(id, "degree", DEGREE_TEXT));
    expect(result._tag === "Left" && result.left._tag).toBe("LlmInvalidOutputError");

    const detail = await getCaseDetail(db, id);
    expect(detail?.documents).toEqual([]);
    expect(detail?.fields).toEqual([]);
  });

  it("stores nothing when the model omits a field", async () => {
    const id = await newCase();
    const { name: _omitted, ...withoutName } = DEGREE_RESPONSE;
    const { layer } = makeTestLlm(() => withoutName);
    const result = await upload(layer, input(id, "degree", DEGREE_TEXT));
    expect(result._tag === "Left" && result.left._tag).toBe("LlmInvalidOutputError");
    expect((await getCaseDetail(db, id))?.fields).toEqual([]);
  });

  it("stores nothing for an unreadable passport", async () => {
    const id = await newCase();
    const { layer } = makeTestLlm(respondByDocument);
    const result = await upload(layer, input(id, "passport", "no machine readable zone here"));
    expect(result._tag === "Left" && result.left._tag).toBe("UnreadableDocumentError");
    expect((await getCaseDetail(db, id))?.documents).toEqual([]);
  });

  it("rejects a non-UTO passport in demo mode, stores nothing and audits the rejection", async () => {
    const id = await newCase();
    const { layer, entries, calls } = makeTestLlm(respondByDocument);
    const result = await upload(layer, input(id, "passport", demoPassportText({ country: "USA" })));

    expect(result._tag === "Left" && result.left._tag).toBe("DemoModeRejectedError");
    expect((await getCaseDetail(db, id))?.documents).toEqual([]);
    expect(entries).toEqual([{ action: "upload_rejected", detail: {} }]);
    expect(calls).toHaveLength(0);
  });

  it("accepts a non-UTO passport when demo mode is off", async () => {
    const { layer } = makeTestLlm(respondByDocument);
    const result = await upload(layer, input(await newCase(), "passport", demoPassportText({ country: "USA" })), false);
    expect(result._tag).toBe("Right");
  });

  it("audits an extraction with counts only", async () => {
    const { layer, entries } = makeTestLlm(respondByDocument);
    await upload(layer, input(await newCase(), "degree", DEGREE_TEXT));
    const extraction = entries.find((e) => e.action === "extraction");
    expect(extraction).toEqual({ action: "extraction", detail: { counts: { fields: 5, low_confidence: 0 } } });
    expect(JSON.stringify(entries)).not.toContain("Anna");
  });
});

function makeTextLlmWithDegree(response: object) {
  return makeTestLlm(() => response);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/pipeline/extract.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/pipeline/extract".

- [ ] **Step 3: Implement the orchestrator**

`src/pipeline/extract.ts`:

```ts
import { Effect } from "effect";
import { AuditLog } from "../audit/audit";
import type { Db } from "../db/db";
import type { DocKind, FieldInput } from "../db/fields";
import type { DemoModeRejectedError, UnreadableDocumentError } from "../errors";
import type { LlmClient, LlmInvalidOutputError, LlmProviderError } from "../llm/LlmClient";
import { saveExtraction } from "../repo/cases";
import { extractDegree, extractOfferLetter } from "./model";
import { extractPassport } from "./passport";

export type ExtractionError =
  | UnreadableDocumentError
  | DemoModeRejectedError
  | LlmProviderError
  | LlmInvalidOutputError;

export interface ExtractInput {
  readonly caseId: string;
  readonly kind: DocKind;
  readonly filename: string;
  readonly text: string;
}

export interface ExtractionSummary {
  readonly kind: DocKind;
  readonly fields: number;
  readonly lowConfidence: number;
}

function fieldsFor(
  input: ExtractInput,
  opts: { readonly demoMode: boolean },
): Effect.Effect<FieldInput[], ExtractionError, LlmClient> {
  switch (input.kind) {
    case "passport":
      return extractPassport(input.text, opts);
    case "degree":
      return extractDegree(input.text);
    case "offer_letter":
      return extractOfferLetter(input.text);
  }
}

/** Extracts a document's fields and stores them. Nothing is stored unless extraction fully succeeds. */
export function extractAndStore(
  db: Db,
  opts: { readonly demoMode: boolean },
  input: ExtractInput,
): Effect.Effect<ExtractionSummary, ExtractionError, LlmClient | AuditLog> {
  return Effect.gen(function* () {
    const audit = yield* AuditLog;
    const fields = yield* fieldsFor(input, opts).pipe(
      Effect.tapErrorTag("DemoModeRejectedError", () => audit.record("upload_rejected", {})),
    );
    yield* Effect.tryPromise(() =>
      saveExtraction(db, {
        caseId: input.caseId,
        kind: input.kind,
        filename: input.filename,
        rawText: input.text,
        fields,
      }),
    ).pipe(Effect.orDie);
    const lowConfidence = fields.filter((f) => f.confidence === "low").length;
    yield* audit.record("extraction", { counts: { fields: fields.length, low_confidence: lowConfidence } });
    return { kind: input.kind, fields: fields.length, lowConfidence };
  });
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run test/pipeline && npm run typecheck`
Expected: all pipeline tests PASS and `tsc` prints nothing.

---

### Task 6: Hono API and server entry

**Files:**
- Create: `src/api/app.ts`, `src/server.ts`
- Modify: `package.json` (add `hono`, `@hono/node-server`, a `start` script)
- Test: `test/api/app.test.ts`

**Interfaces:**
- Consumes: `extractAndStore`, `ExtractionError` (Task 5); `createCase`, `caseExists`, `listCases`, `getCaseDetail`, `updateField` (Task 2); `makeTestLlm` and fixtures (Tasks 3, 4)
- Produces:
  - `interface AppDeps { db: Db; layer: Layer.Layer<LlmClient | AuditLog>; demoMode: boolean }`
  - `makeApp(deps: AppDeps): Hono`
  - Routes: `POST /cases` (201), `GET /cases`, `GET /cases/:id`, `POST /cases/:id/documents` (JSON body `{ kind, filename, text }`), `PATCH /fields/:id`

- [ ] **Step 1: Install dependencies**

Run: `npm install hono @hono/node-server`
Expected: installs without errors.

- [ ] **Step 2: Write the failing tests**

`test/api/app.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp } from "../../src/api/app";
import type { Db } from "../../src/db/db";
import type { MockCall } from "../../src/llm/mock";
import { DEGREE_TEXT } from "../fixtures/degree";
import { OFFER_LETTER_TEXT } from "../fixtures/offerLetter";
import { demoPassportText } from "../fixtures/passport";
import { makeTestLlm, respondByDocument } from "../helpers/llm";
import { makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

function setup(respond: (call: MockCall) => string | object = respondByDocument, demoMode = true, useDb: Db = db) {
  const llm = makeTestLlm(respond);
  const app = makeApp({ db: useDb, layer: llm.layer, demoMode });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const newCase = async () => ((await (await send("POST", "/cases", { label: "Eriksson H-1B" })).json()) as { id: string }).id;
  const uploadDoc = (id: string, kind: string, text: string, filename = `${kind}.txt`) =>
    send("POST", `/cases/${id}/documents`, { kind, filename, text });
  return { app, send, newCase, uploadDoc, llm };
}

describe("POST /cases", () => {
  it("creates a case", async () => {
    const { send } = setup();
    const res = await send("POST", "/cases", { label: "Eriksson H-1B" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ label: "Eriksson H-1B" });
  });

  it("returns 400 for a missing label or a body that is not JSON", async () => {
    const { send, app } = setup();
    expect((await send("POST", "/cases", {})).status).toBe(400);
    expect((await app.request("/cases", { method: "POST", body: "not json" })).status).toBe(400);
  });
});

describe("POST /cases/:id/documents", () => {
  it("extracts and stores a passport, a degree and an offer letter", async () => {
    const { send, newCase, uploadDoc } = setup();
    const id = await newCase();

    const passport = await uploadDoc(id, "passport", demoPassportText());
    expect(passport.status).toBe(200);
    expect(await passport.json()).toEqual({ kind: "passport", fields: 9, lowConfidence: 0 });
    expect((await uploadDoc(id, "degree", DEGREE_TEXT)).status).toBe(200);
    expect((await uploadDoc(id, "offer_letter", OFFER_LETTER_TEXT)).status).toBe(200);

    const detail = (await (await send("GET", `/cases/${id}`)).json()) as { documents: unknown[]; fields: unknown[] };
    expect(detail.documents).toHaveLength(3);
    expect(detail.fields).toHaveLength(21);
  });

  it("returns 404 for an unknown or malformed case id", async () => {
    const { uploadDoc } = setup();
    expect((await uploadDoc("00000000-0000-0000-0000-000000000000", "degree", DEGREE_TEXT)).status).toBe(404);
    expect((await uploadDoc("not-a-uuid", "degree", DEGREE_TEXT)).status).toBe(404);
  });

  it("returns 400 for an unknown kind or a missing filename", async () => {
    const { newCase, uploadDoc, send } = setup();
    const id = await newCase();
    expect((await uploadDoc(id, "selfie", "text")).status).toBe(400);
    expect((await send("POST", `/cases/${id}/documents`, { kind: "degree", text: "text" })).status).toBe(400);
  });

  it("returns 400 for empty or whitespace-only text, without calling the model", async () => {
    const { newCase, uploadDoc, llm } = setup();
    const id = await newCase();
    expect((await uploadDoc(id, "degree", "")).status).toBe(400);
    expect((await uploadDoc(id, "degree", "  \n  ")).status).toBe(400);
    expect(llm.calls).toHaveLength(0);
  });

  it("returns 422 for a passport with no MRZ", async () => {
    const { newCase, uploadDoc } = setup();
    const res = await uploadDoc(await newCase(), "passport", "a scanned page");
    expect(res.status).toBe(422);
  });

  it("returns 403 for a non-UTO passport in demo mode", async () => {
    const { newCase, uploadDoc } = setup();
    const res = await uploadDoc(await newCase(), "passport", demoPassportText({ country: "USA" }));
    expect(res.status).toBe(403);
  });

  it("returns 502 with a safe message when the model output is invalid", async () => {
    const { newCase, uploadDoc } = setup(() => "garbage");
    const res = await uploadDoc(await newCase(), "degree", DEGREE_TEXT);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Model output was not valid JSON" });
  });
});

describe("GET /cases", () => {
  it("lists cases with a summary", async () => {
    const { send, newCase, uploadDoc } = setup();
    const id = await newCase();
    await uploadDoc(id, "passport", demoPassportText());
    await uploadDoc(id, "offer_letter", OFFER_LETTER_TEXT);

    const list = (await (await send("GET", "/cases")).json()) as { id: string }[];
    expect(list.find((c) => c.id === id)).toMatchObject({
      beneficiary: "ANNA MARIA ERIKSSON",
      employer: "Utopia Technologies Inc.",
      status: "needs_review",
      documents: 2,
    });
  });
});

describe("GET /cases/:id", () => {
  it("returns 404 for an unknown or malformed id", async () => {
    const { send } = setup();
    expect((await send("GET", "/cases/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await send("GET", "/cases/not-a-uuid")).status).toBe(404);
  });

  it("never returns the raw document text or sensitive values that were only in it", async () => {
    const { send, newCase, uploadDoc } = setup();
    const id = await newCase();
    await uploadDoc(id, "offer_letter", OFFER_LETTER_TEXT);
    const body = await (await send("GET", `/cases/${id}`)).text();
    expect(body).not.toContain("123-45-6789");
    expect(body).not.toContain("raw_text");
  });
});

describe("PATCH /fields/:id", () => {
  async function firstField() {
    const ctx = setup();
    const id = await ctx.newCase();
    await ctx.uploadDoc(id, "degree", DEGREE_TEXT);
    const detail = (await (await ctx.send("GET", `/cases/${id}`)).json()) as { fields: { id: string }[] };
    return { ...ctx, fieldId: detail.fields[0].id };
  }

  it("edits a value, marking it attorney-sourced and pending", async () => {
    const { send, fieldId } = await firstField();
    const res = await send("PATCH", `/fields/${fieldId}`, { value: "Anna Maria Eriksson" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ value: "Anna Maria Eriksson", source: "attorney", status: "pending" });
  });

  it("approves a field", async () => {
    const { send, fieldId } = await firstField();
    const res = await send("PATCH", `/fields/${fieldId}`, { status: "approved" });
    expect(await res.json()).toMatchObject({ status: "approved" });
  });

  it("returns 400 for an empty patch or a bad status", async () => {
    const { send, fieldId } = await firstField();
    expect((await send("PATCH", `/fields/${fieldId}`, {})).status).toBe(400);
    expect((await send("PATCH", `/fields/${fieldId}`, { status: "maybe" })).status).toBe(400);
  });

  it("returns 404 for an unknown or malformed field id", async () => {
    const { send } = setup();
    expect((await send("PATCH", "/fields/00000000-0000-0000-0000-000000000000", { status: "approved" })).status).toBe(404);
    expect((await send("PATCH", "/fields/nope", { status: "approved" })).status).toBe(404);
  });
});

describe("unexpected failures", () => {
  it("returns 500 with a generic message that hides the cause", async () => {
    const broken: Db = {
      ...db,
      query: async () => {
        throw new Error("secret connection detail");
      },
    };
    const { send } = setup(respondByDocument, true, broken);
    const res = await send("GET", "/cases");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/api/app.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/api/app".

- [ ] **Step 4: Implement the app**

`src/api/app.ts`:

```ts
import { Effect, Either, Schema, type Layer } from "effect";
import { Hono, type Context } from "hono";
import type { AuditLog } from "../audit/audit";
import type { Db } from "../db/db";
import type { LlmClient } from "../llm/LlmClient";
import { extractAndStore, type ExtractionError } from "../pipeline/extract";
import { caseExists, createCase, getCaseDetail, listCases, updateField } from "../repo/cases";

export interface AppDeps {
  readonly db: Db;
  readonly layer: Layer.Layer<LlmClient | AuditLog>;
  readonly demoMode: boolean;
}

const CreateCase = Schema.Struct({ label: Schema.NonEmptyString });
const UploadBody = Schema.Struct({
  kind: Schema.Literal("passport", "degree", "offer_letter"),
  filename: Schema.NonEmptyString,
  text: Schema.String,
});
const PatchField = Schema.Struct({
  value: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Literal("pending", "approved")),
});

type Upload = Schema.Schema.Type<typeof UploadBody>;
type UploadResult =
  | { readonly ok: true; readonly upload: Upload }
  | { readonly ok: false; readonly status: 400 | 415 | 422; readonly message: string };

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

async function readUpload(c: Context): Promise<UploadResult> {
  const parsed = Schema.decodeUnknownEither(UploadBody)(await readJson(c));
  if (Either.isLeft(parsed)) {
    return { ok: false, status: 400, message: "kind, filename and text are required" };
  }
  if (parsed.right.text.trim() === "") {
    return { ok: false, status: 400, message: "The document has no text" };
  }
  return { ok: true, upload: parsed.right };
}

function extractionErrorResponse(c: Context, e: ExtractionError) {
  switch (e._tag) {
    case "UnreadableDocumentError":
      return c.json({ error: e.message }, 422);
    case "DemoModeRejectedError":
      return c.json({ error: e.message }, 403);
    case "LlmProviderError":
    case "LlmInvalidOutputError":
      return c.json({ error: e.message }, 502);
  }
}

export function makeApp(deps: AppDeps): Hono {
  const app = new Hono();
  const badRequest = (c: Context, message: string) => c.json({ error: message }, 400);
  const notFound = (c: Context) => c.json({ error: "Not found" }, 404);

  app.post("/cases", async (c) => {
    const parsed = Schema.decodeUnknownEither(CreateCase)(await readJson(c));
    if (Either.isLeft(parsed)) return badRequest(c, "label is required");
    return c.json(await createCase(deps.db, parsed.right.label), 201);
  });

  app.get("/cases", async (c) => c.json(await listCases(deps.db)));

  app.get("/cases/:id", async (c) => {
    const detail = await getCaseDetail(deps.db, c.req.param("id"));
    return detail ? c.json(detail) : notFound(c);
  });

  app.post("/cases/:id/documents", async (c) => {
    const caseId = c.req.param("id");
    if (!(await caseExists(deps.db, caseId))) return notFound(c);
    const read = await readUpload(c);
    if (!read.ok) return c.json({ error: read.message }, read.status);
    const result = await Effect.runPromise(
      extractAndStore(deps.db, { demoMode: deps.demoMode }, { caseId, ...read.upload }).pipe(
        Effect.provide(deps.layer),
        Effect.either,
      ),
    );
    return Either.isLeft(result) ? extractionErrorResponse(c, result.left) : c.json(result.right);
  });

  app.patch("/fields/:id", async (c) => {
    const parsed = Schema.decodeUnknownEither(PatchField)(await readJson(c));
    if (Either.isLeft(parsed) || (parsed.right.value === undefined && parsed.right.status === undefined)) {
      return badRequest(c, "Provide a value, a status of pending or approved, or both");
    }
    const updated = await updateField(deps.db, c.req.param("id"), parsed.right);
    return updated ? c.json(updated) : notFound(c);
  });

  app.onError((_err, c) => c.json({ error: "Internal error" }, 500));
  return app;
}
```

- [ ] **Step 5: Add the server entry and start script**

`src/server.ts`:

```ts
import { serve } from "@hono/node-server";
import { Effect, Layer } from "effect";
import pg from "pg";
import { makeApp } from "./api/app";
import { AuditLogPg } from "./audit/audit";
import { makePgDb } from "./db/pg";
import { llmProviderFromEnv } from "./llm/config";
import { makeLlmClientLayer } from "./llm/LlmClient";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// Fail fast on a bad LLM_PROVIDER or a missing API key.
const provider = await Effect.runPromise(llmProviderFromEnv(process.env));

const db = makePgDb(new pg.Pool({ connectionString: databaseUrl }));
const audit = AuditLogPg(db);
const layer = Layer.merge(audit, makeLlmClientLayer(provider).pipe(Layer.provide(audit)));
const demoMode = process.env.DEMO_MODE !== "false";

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: makeApp({ db, layer, demoMode }).fetch, port });
console.log(`Petition Prep API on :${port} (provider ${provider.name}, demo mode ${demoMode ? "on" : "off"})`);
```

Add `"start": "tsx src/server.ts"` to `scripts` in `package.json`, and append these lines to `.env.example`:

```
DEMO_MODE=true
PORT=3000
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run test/api && npm run typecheck`
Expected: all API tests PASS and `tsc` prints nothing.

---

### Task 7: Multipart upload and PDF text

**Files:**
- Create: `src/api/pdf.ts`
- Modify: `src/api/app.ts` (`readUpload`)
- Modify: `package.json` (add `pdf-lib`, `unpdf`)
- Test: `test/api/pdf.test.ts`, `test/api/upload.test.ts`

**Interfaces:**
- Consumes: `makeApp`, `AppDeps` (Task 6), `demoPassportText` (Task 3), fixtures and `makeTestLlm`
- Produces:
  - `pdfToText(bytes: Uint8Array): Promise<string>` (throws on a corrupt PDF)
  - `POST /cases/:id/documents` also accepts `multipart/form-data` with fields `kind` and `file` (a `.pdf` or text file); the stored filename is the file's name

- [ ] **Step 1: Install dependencies**

Run: `npm install pdf-lib unpdf`
Expected: installs without errors.

- [ ] **Step 2: Write the failing tests**

`test/api/pdf.test.ts`:

```ts
import { Either } from "effect";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pdfToText } from "../../src/api/pdf";
import { parseMrz } from "../../src/privacy/mrz";
import { demoPassportText } from "../fixtures/passport";

export async function makePdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Courier);
  text.split("\n").forEach((line, i) => page.drawText(line, { x: 20, y: 800 - i * 14, size: 8, font }));
  return pdf.save();
}

describe("pdfToText", () => {
  it("extracts text with the MRZ lines still on separate lines", async () => {
    const text = await pdfToText(await makePdf(demoPassportText()));
    expect(text).toContain("ERIKSSON");
    expect(Either.isRight(parseMrz(text))).toBe(true);
  });

  it("returns empty text for a PDF with no text", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    expect((await pdfToText(await pdf.save())).trim()).toBe("");
  });

  it("throws for bytes that are not a PDF", async () => {
    await expect(pdfToText(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});
```

`test/api/upload.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp } from "../../src/api/app";
import type { Db } from "../../src/db/db";
import { DEGREE_TEXT } from "../fixtures/degree";
import { demoPassportText } from "../fixtures/passport";
import { makeTestLlm, respondByDocument } from "../helpers/llm";
import { makeTestDb } from "../helpers/testDb";
import { makePdf } from "./pdf.test";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

function setup() {
  const llm = makeTestLlm(respondByDocument);
  const app = makeApp({ db, layer: llm.layer, demoMode: true });
  const newCase = async () => {
    const res = await app.request("/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Eriksson H-1B" }),
    });
    return ((await res.json()) as { id: string }).id;
  };
  const upload = (id: string, kind: string, file: File) => {
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    return app.request(`/cases/${id}/documents`, { method: "POST", body: form });
  };
  return { app, newCase, upload, llm };
}

describe("multipart upload", () => {
  it("reads a passport from a PDF and stores it under the file's name", async () => {
    const { app, newCase, upload } = setup();
    const id = await newCase();
    const bytes = await makePdf(demoPassportText());

    const res = await upload(id, "passport", new File([bytes], "passport.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "passport", fields: 9, lowConfidence: 0 });

    const detail = (await (await app.request(`/cases/${id}`)).json()) as { documents: { filename: string }[] };
    expect(detail.documents).toEqual([{ kind: "passport", filename: "passport.pdf" }]);
  });

  it("reads a text file", async () => {
    const { newCase, upload } = setup();
    const res = await upload(await newCase(), "degree", new File([DEGREE_TEXT], "degree.txt", { type: "text/plain" }));
    expect(res.status).toBe(200);
  });

  it("returns 422 for a PDF with no text", async () => {
    const { newCase, upload, llm } = setup();
    const empty = await (async () => {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      pdf.addPage();
      return pdf.save();
    })();
    const res = await upload(await newCase(), "degree", new File([empty], "scan.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(422);
    expect(llm.calls).toHaveLength(0);
  });

  it("returns 422 for a corrupt PDF", async () => {
    const { newCase, upload } = setup();
    const res = await upload(await newCase(), "degree", new File(["not a pdf"], "broken.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(422);
  });

  it("returns 400 when the file or kind is missing", async () => {
    const { app, newCase } = setup();
    const id = await newCase();
    const noFile = new FormData();
    noFile.set("kind", "degree");
    expect((await app.request(`/cases/${id}/documents`, { method: "POST", body: noFile })).status).toBe(400);
    const noKind = new FormData();
    noKind.set("file", new File(["text"], "a.txt"));
    expect((await app.request(`/cases/${id}/documents`, { method: "POST", body: noKind })).status).toBe(400);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/api/pdf.test.ts test/api/upload.test.ts`
Expected: FAIL with "Failed to resolve import ../../src/api/pdf". Importing `makePdf` from a `.test` file also registers the `pdf.test.ts` tests inside `upload.test.ts`. That's harmless but noisy, so if it bothers you, move `makePdf` to `test/helpers/pdf.ts` and import it from both files.

- [ ] **Step 4: Implement PDF text extraction**

`src/api/pdf.ts`:

```ts
import { extractText, getDocumentProxy } from "unpdf";

/** Extracts the text layer of a PDF. Throws if the bytes are not a readable PDF. */
export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
```

If `unpdf`'s API differs from this, read `node_modules/unpdf/README.md` and adjust only this file. If the extracted MRZ lines come back on one line, keep the test and fix `pdfToText` (for example by inserting a newline whenever a text item reports `hasEOL`). Use systematic-debugging, and do not weaken the test.

- [ ] **Step 5: Accept multipart in `readUpload`**

In `src/api/app.ts`, add the import:

```ts
import { pdfToText } from "./pdf";
```

Replace the whole `readUpload` function with:

```ts
const KINDS = ["passport", "degree", "offer_letter"] as const;

async function readMultipart(c: Context): Promise<UploadResult> {
  const form = await c.req.parseBody().catch(() => undefined);
  const file = form?.file;
  const kind = form?.kind;
  if (!(file instanceof File) || typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) {
    return { ok: false, status: 400, message: "kind and file are required" };
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  let text: string;
  try {
    text = isPdf ? await pdfToText(new Uint8Array(await file.arrayBuffer())) : await file.text();
  } catch {
    return { ok: false, status: 422, message: "Could not read the PDF" };
  }
  if (text.trim() === "") {
    return {
      ok: false,
      status: isPdf ? 422 : 400,
      message: isPdf ? "The PDF has no text layer (scanned PDFs are not supported)" : "The document has no text",
    };
  }
  return { ok: true, upload: { kind: kind as Upload["kind"], filename: file.name, text } };
}

async function readUpload(c: Context): Promise<UploadResult> {
  if ((c.req.header("content-type") ?? "").includes("multipart/form-data")) return readMultipart(c);
  const parsed = Schema.decodeUnknownEither(UploadBody)(await readJson(c));
  if (Either.isLeft(parsed)) {
    return { ok: false, status: 400, message: "kind, filename and text are required" };
  }
  if (parsed.right.text.trim() === "") {
    return { ok: false, status: 400, message: "The document has no text" };
  }
  return { ok: true, upload: parsed.right };
}
```

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: every test PASSES (the 61 from spec 01, plus the new ones) and `tsc` prints nothing.

- [ ] **Step 7: Smoke-test the real server (manual, optional but recommended)**

Run (with a real key; skip if none): `LLM_PROVIDER=mock DEMO_MODE=true DATABASE_URL=<a local Postgres> npm run migrate && npm start`. If no Postgres is available, skip this step. The PGlite-backed API tests already cover every route, and `src/server.ts` is covered by `npm run typecheck` only.

---

## Self-Review

**Spec coverage**
- Upload → extract → store → `POST /cases/:id/documents`: Tasks 5, 6 and 7.
- Passport: local MRZ, `mrz` source, `high` confidence, the MRZ text as quote, never sent to a model: Task 3, with the "never calls the model" test in Task 5.
- Degree and offer letter: redact, call, validate with `Schema`, restore, write: Task 4. The demo uses Anthropic through the same `LlmClient`.
- Confidence: `high` only if the quote is in `raw_text`, missing values stored as low: Task 4.
- Re-upload replaces and resets: Tasks 2 and 5.
- Audit: extraction, model use and redaction counts (Task 4 via `LlmClient`, Task 5 for `extraction`).
- API routes and typed error mapping, including the HTTP table: Task 6.
- Demo guard before storage and model call, audited: Tasks 3 and 5, and 403 in Task 6.
- Sample documents: fixtures in Tasks 3 and 4. The degree omits the middle name and the passport expires 2027-01-15, close to the 2026-10-01 start date.
- Tests list from the spec: pipeline fixtures, low confidence, re-upload, passport never calls the model, non-`UTO` rejected, tokens not originals: all present.
- Open items: field names are fixed in the Global Constraints, and failure handling is one retry.

**Placeholders:** none.

**Type consistency:** `FieldInput`, `DocKind`, `FieldRow` and `CaseSummary` are defined once (spec 01, Task 2) and used unchanged. `ExtractInput` and `ExtractionSummary` (Task 5) match the API (Task 6). `makeTestLlm` (Task 4) is used by Tasks 5 to 7. `UploadResult` and `readUpload` (Task 6) are replaced whole in Task 7.

**Judgement calls**
- `CaseSummary.lowConfidence` is an interim count (low-confidence fields). Spec 03's checks give the real discrepancy count.
- `mrz_check_digits` is an extra passport field (not in the spec) so spec 03 can raise the "MRZ check digits" problem from stored data.
- PDF support uses `unpdf` and covers PDFs with a text layer only. Scanned PDFs return 422 (OCR is out of scope).
- `Effect.retry({ times: 1 })` retries on any model error, so a provider failure and an invalid output both get one retry.
- No commits are made, per the user's standing preference.
