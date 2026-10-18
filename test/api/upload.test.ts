import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp } from "../../src/api/app";
import type { Db } from "../../src/db/db";
import { DEGREE_TEXT } from "../fixtures/degree";
import { demoPassportText } from "../fixtures/passport";
import { makeTestLlm, respondByDocument } from "../helpers/llm";
import { makeBlankPdf, makePdf } from "../helpers/pdf";
import { makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

function setup() {
  const llm = makeTestLlm(respondByDocument);
  const app = makeApp({ db, layer: llm.layer, demoMode: true, modelName: "mock" });
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

  it("returns 422 for a PDF with no text, without calling the model", async () => {
    const { newCase, upload, llm } = setup();
    const res = await upload(await newCase(), "degree", new File([await makeBlankPdf()], "scan.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(422);
    expect(llm.calls).toHaveLength(0);
  });

  it("returns 422 for a corrupt PDF", async () => {
    const { newCase, upload } = setup();
    const res = await upload(await newCase(), "degree", new File(["not a pdf"], "broken.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(422);
  });

  it("detects a PDF by its header even without a .pdf name or content type", async () => {
    const { newCase, upload } = setup();
    const bytes = await makePdf(demoPassportText());
    const res = await upload(await newCase(), "passport", new File([bytes], "scan", { type: "application/octet-stream" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "passport", fields: 9, lowConfidence: 0 });
  });

  it("returns 422 for a binary file that is not a PDF, without calling the model", async () => {
    const { newCase, upload, llm } = setup();
    const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x00]);
    const res = await upload(await newCase(), "degree", new File([binary], "degree.txt", { type: "text/plain" }));
    expect(res.status).toBe(422);
    expect(llm.calls).toHaveLength(0);
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
