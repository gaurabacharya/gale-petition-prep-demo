import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeApp } from "../../src/api/app";
import type { Db } from "../../src/db/db";
import { seedCase } from "../helpers/caseFixture";
import { makeTestLlm, respondByDocument } from "../helpers/llm";
import { makeTestDb } from "../helpers/testDb";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => db.close());

function setup(respond: Parameters<typeof makeTestLlm>[0] = respondByDocument) {
  const llm = makeTestLlm(respond);
  const app = makeApp({ db, layer: llm.layer, demoMode: true, modelName: "mock" });
  const post = (path: string) => app.request(path, { method: "POST" });
  return { post, llm };
}

describe("POST /cases/:id/data-sheet", () => {
  it("returns a PDF when everything is approved, and audits counts only", async () => {
    const { post, llm } = setup();
    const id = await seedCase(db, { approve: true });
    const res = await post(`/cases/${id}/data-sheet`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="petition-data-[A-Za-z0-9_-]+\.pdf"$/);
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    expect(llm.entries).toEqual([{ action: "output_generated", detail: { counts: { data_sheet: 1 } } }]);
    expect(llm.calls).toHaveLength(0);
  });

  it("returns 409 with a clear message while a field is pending, and does not audit", async () => {
    const { post, llm } = setup();
    const id = await seedCase(db);
    const res = await post(`/cases/${id}/data-sheet`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("not approved");
    expect(llm.entries).toEqual([]);
  });

  it("returns 404 for an unknown or malformed id", async () => {
    const { post } = setup();
    expect((await post("/cases/00000000-0000-0000-0000-000000000000/data-sheet")).status).toBe(404);
    expect((await post("/cases/nope/data-sheet")).status).toBe(404);
  });
});

describe("POST /cases/:id/letter", () => {
  it("returns the draft and the model name when everything is approved", async () => {
    const { post, llm } = setup(() => ({ body: "Dear Officer, ..." }));
    const id = await seedCase(db, { approve: true });
    const res = await post(`/cases/${id}/letter`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ body: "Dear Officer, ...", model: "mock" });
    expect(llm.calls).toHaveLength(1);
  });

  it("returns 409 and never calls the model while a field is pending", async () => {
    const { post, llm } = setup(() => ({ body: "x" }));
    const id = await seedCase(db);
    expect((await post(`/cases/${id}/letter`)).status).toBe(409);
    expect(llm.calls).toHaveLength(0);
  });

  it("returns 502 when the model returns a blank letter", async () => {
    const { post } = setup(() => ({ body: " " }));
    const id = await seedCase(db, { approve: true });
    expect((await post(`/cases/${id}/letter`)).status).toBe(502);
  });

  it("returns 404 for an unknown case", async () => {
    const { post } = setup();
    expect((await post("/cases/00000000-0000-0000-0000-000000000000/letter")).status).toBe(404);
  });
});
