import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../../src/db/db";
import { buildLetterFacts, buildLetterPrompt, generateLetter, LETTER_FACTS } from "../../src/outputs/letter";
import { getCaseDetail, type FieldRow } from "../../src/repo/cases";
import { BASE_FIELDS, seedCase } from "../helpers/caseFixture";
import { makeTestLlm } from "../helpers/llm";
import { makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

const detailFields = async (id: string): Promise<FieldRow[]> => [...(await getCaseDetail(db, id))!.fields];
const run = (llm: ReturnType<typeof makeTestLlm>, id: string, fields: FieldRow[]) =>
  Effect.runPromise(Effect.either(generateLetter(db, id, fields, "mock:mock").pipe(Effect.provide(llm.layer))));
const letterRows = async (id: string) =>
  (await db.query<{ body: string; model: string }>("select body, model from letters where case_id = $1", [id])).rows;

describe("letter facts and prompt", () => {
  it("has exactly 11 facts and none from the excluded passport fields", () => {
    expect(LETTER_FACTS).toHaveLength(11);
    const excluded = ["passport_number", "date_of_birth", "nationality"];
    expect(LETTER_FACTS.filter((f) => excluded.includes(f.name))).toEqual([]);
    expect(LETTER_FACTS.filter((f) => f.docKind === "passport")).toEqual([]);
  });

  it("keeps passport number, date of birth and nationality out of the prompt", async () => {
    const id = await seedCase(db, { approve: true });
    const prompt = buildLetterPrompt(buildLetterFacts(await detailFields(id)));
    for (const secret of ["L898902C3", "1994-08-12", "UTO"]) expect(prompt).not.toContain(secret);
    expect(prompt).toContain("Software Engineer");
    expect(prompt).toContain("Utopia Technologies Inc.");
  });

  it("turns a missing fact into a bracket placeholder", async () => {
    const id = await seedCase(db, { approve: true, override: { degree: BASE_FIELDS.degree.filter((x) => x.name !== "degree") } });
    const facts = buildLetterFacts(await detailFields(id));
    expect(facts.degree).toBe("[DEGREE]");
    expect(buildLetterPrompt(facts)).toContain("[DEGREE]");
    expect(facts.field_of_study).toBe("Computer Science");
  });
});

describe("generateLetter", () => {
  it("redacts the input, restores the output, saves the draft and audits without values", async () => {
    const duties = BASE_FIELDS.offer_letter.map((x) =>
      x.name === "duties" ? { ...x, value: "backend work; contact SSN 123-45-6789" } : x,
    );
    const id = await seedCase(db, { approve: true, override: { offer_letter: duties } });
    const llm = makeTestLlm(() => ({ body: "Dear Officer, the SSN [[SSN_1]] is on file." }));
    const result = await run(llm, id, await detailFields(id));

    expect(llm.calls[0].prompt).toContain("[[SSN_1]]");
    expect(llm.calls[0].prompt).not.toContain("123-45-6789");
    expect(result._tag === "Right" && result.right).toEqual({
      body: "Dear Officer, the SSN 123-45-6789 is on file.",
      model: "mock:mock",
    });
    expect(await letterRows(id)).toEqual([{ body: "Dear Officer, the SSN 123-45-6789 is on file.", model: "mock:mock" }]);
    expect(llm.entries.map((e) => e.action)).toEqual(["llm_call", "output_generated"]);
    expect(llm.entries[0].detail.redactions).toEqual({ SSN: 1 });
    expect(JSON.stringify(llm.entries)).not.toContain("123-45-6789");
  });

  it("fails with LlmInvalidOutputError and saves nothing when the body is blank", async () => {
    const id = await seedCase(db, { approve: true });
    const llm = makeTestLlm(() => ({ body: "   " }));
    const result = await run(llm, id, await detailFields(id));
    expect(result._tag === "Left" && result.left._tag).toBe("LlmInvalidOutputError");
    expect(await letterRows(id)).toEqual([]);
  });

  it("replaces the saved draft when regenerated", async () => {
    const id = await seedCase(db, { approve: true });
    const fields = await detailFields(id);
    await run(makeTestLlm(() => ({ body: "first" })), id, fields);
    await run(makeTestLlm(() => ({ body: "second" })), id, fields);
    expect(await letterRows(id)).toEqual([{ body: "second", model: "mock:mock" }]);
  });
});
