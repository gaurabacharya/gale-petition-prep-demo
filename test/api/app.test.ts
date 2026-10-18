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
  const app = makeApp({ db: useDb, layer: llm.layer, demoMode, modelName: "mock" });
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

  it("returns 400 for text or a filename containing a NUL byte, without calling the model", async () => {
    const { newCase, uploadDoc, send, llm } = setup();
    const id = await newCase();
    expect((await uploadDoc(id, "degree", `${DEGREE_TEXT}\u0000`)).status).toBe(400);
    expect((await uploadDoc(id, "degree", DEGREE_TEXT, "a\u0000b.txt")).status).toBe(400);
    expect((await send("POST", `/cases/${id}/documents`, { kind: "degree", filename: "a.txt", text: `x\u0000` })).status).toBe(400);
    expect(llm.calls).toHaveLength(0);
  });

  it("returns 413 for text over the size cap, without calling the model", async () => {
    const { newCase, uploadDoc, llm } = setup();
    const id = await newCase();
    const res = await uploadDoc(id, "degree", "a".repeat(300_000));
    expect(res.status).toBe(413);
    expect(llm.calls).toHaveLength(0);
  });

  it("returns 413 for a request body over the byte limit", async () => {
    const { newCase, uploadDoc, llm } = setup();
    const id = await newCase();
    const res = await uploadDoc(id, "degree", "a".repeat(6 * 1024 * 1024));
    expect(res.status).toBe(413);
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

  it("stores nothing and audits the rejection when a real-looking passport is refused", async () => {
    const { send, newCase, uploadDoc, llm } = setup();
    const id = await newCase();
    const res = await uploadDoc(id, "passport", demoPassportText({ country: "USA" }));
    expect(res.status).toBe(403);
    expect(llm.entries).toEqual([{ action: "upload_rejected", detail: {} }]);
    expect(llm.calls).toHaveLength(0);
    const detail = (await (await send("GET", `/cases/${id}`)).json()) as { documents: unknown[]; fields: unknown[] };
    expect([detail.documents.length, detail.fields.length]).toEqual([0, 0]);
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
      status: "discrepancy",
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

  it("returns 400 for an edited value containing a NUL byte", async () => {
    const { send, fieldId } = await firstField();
    expect((await send("PATCH", `/fields/${fieldId}`, { value: "a\u0000b" })).status).toBe(400);
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

describe("GET /cases/:id/checks", () => {
  it("returns missing-document problems for an empty case", async () => {
    const { send, newCase } = setup();
    const res = await send("GET", `/cases/${await newCase()}/checks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checks: { id: string; level: string }[]; discrepancies: number };
    expect(body.checks.filter((c) => c.id.startsWith("missing_document_") && c.level === "problem")).toHaveLength(3);
    expect(body.discrepancies).toBe(3);
  });

  it("returns 404 for a malformed or unknown id", async () => {
    const { send } = setup();
    expect((await send("GET", "/cases/not-a-uuid/checks")).status).toBe(404);
    expect((await send("GET", "/cases/00000000-0000-0000-0000-000000000000/checks")).status).toBe(404);
  });

  it("reports the middle-name warnings after the three fixtures are uploaded", async () => {
    const { send, newCase, uploadDoc } = setup();
    const id = await newCase();
    await uploadDoc(id, "passport", demoPassportText());
    await uploadDoc(id, "degree", DEGREE_TEXT);
    await uploadDoc(id, "offer_letter", OFFER_LETTER_TEXT);
    const body = (await (await send("GET", `/cases/${id}/checks`)).json()) as {
      checks: { id: string; level: string }[];
      discrepancies: number;
    };
    expect(body.checks.find((c) => c.id === "name_mismatch_degree")?.level).toBe("warning");
    expect(body.discrepancies).toBeGreaterThan(0);
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
