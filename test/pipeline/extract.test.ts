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

const newCase = async () => (await createCase(db, "Doe H-1B")).id;
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

    const second = makeTestLlm(() => ({
      ...DEGREE_RESPONSE,
      degree: { value: "Master of Science", quote: "Bachelor of Science in Computer Science" },
    }));
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
    expect(JSON.stringify(entries)).not.toContain("John");
  });
});
