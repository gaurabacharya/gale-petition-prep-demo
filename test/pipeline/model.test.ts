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
