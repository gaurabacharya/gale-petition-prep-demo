import { Either } from "effect";
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { makeApp } from "../../src/api/app";
import { closeOcr, normaliseOcr, ocrToText, repairMrz } from "../../src/api/ocr";
import { pdfToText } from "../../src/api/pdf";
import { parseMrz } from "../../src/privacy/mrz";
import { extractDegree, extractOfferLetter } from "../../src/pipeline/model";
import { Effect, Layer } from "effect";
import { makeMemoryAuditLog } from "../../src/audit/audit";
import { makeLlmClientLayer } from "../../src/llm/LlmClient";
import { makeReplayProvider } from "../../src/llm/replay";
import { makeTestLlm, respondByDocument } from "../helpers/llm";
import { makeTestDb } from "../helpers/testDb";

afterAll(() => closeOcr());

const passportPng = () => readFileSync("samples/passport.png");
const png = (bytes: Uint8Array, name = "passport.png") => new File([new Uint8Array(bytes)], name, { type: "image/png" });

describe("repairMrz", () => {
  it("fixes look-alike characters by position and turns KLLL runs back into filler", () => {
    const noisy = "P<UTODOE<<JOHN<MICHAEL<<KLLLLLLLLLLLLLLLLLLL\nL898902C36UT09408126M2701150<<<<<<<<<<<<<<00";
    const [l1, l2] = repairMrz(noisy).split("\n");
    expect(l1).toBe("P<UTODOE<<JOHN<MICHAEL".padEnd(44, "<"));
    expect(l2).toBe("L898902C36UTO9408126M2701150<<<<<<<<<<<<<<00");
  });

  it("leaves text alone when there are not two MRZ-length lines", () => {
    expect(repairMrz("HELLO\nWORLD")).toBe("HELLO\nWORLD");
  });

  it("normalises case, spaces and chevrons", () => {
    expect(normaliseOcr("p« UTO\n\n  ab c ")).toBe("P<UTO\nABC");
  });
});

describe("OCR of the sample passport scan", () => {
  it("reads the MRZ with every check digit valid", async () => {
    const r = parseMrz(await ocrToText(passportPng()));
    expect(Either.isRight(r)).toBe(true);
    if (Either.isRight(r)) {
      expect(r.right.surname.value).toBe("DOE");
      expect(r.right.givenNames.value).toBe("JOHN MICHAEL");
      expect(r.right.passportNumber.value).toBe("L898902C3");
      expect(r.right.issuingCountry.value).toBe("UTO");
      expect(Object.values(r.right.checks).every(Boolean)).toBe(true);
    }
  }, 30000);
});

describe("PDF samples", () => {
  const layer = () => {
    const audit = makeMemoryAuditLog();
    return Layer.merge(audit.layer, makeLlmClientLayer(makeReplayProvider()).pipe(Layer.provide(audit.layer)));
  };

  it("extract with every field found in the text layer", async () => {
    for (const [file, extract] of [["degree", extractDegree], ["offer-letter", extractOfferLetter]] as const) {
      const text = await pdfToText(readFileSync(`samples/${file}.pdf`));
      const fields = await Effect.runPromise(extract(text).pipe(Effect.provide(layer())));
      expect(fields.every((f) => f.confidence === "high")).toBe(true);
    }
  });
});

describe("scan upload", () => {
  const setup = async () => {
    const db = await makeTestDb();
    const llm = makeTestLlm(respondByDocument);
    const app = makeApp({ db, layer: llm.layer, demoMode: true, modelName: "mock" });
    const id = ((await (await app.request("/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: "Doe H-1B" }) })).json()) as { id: string }).id;
    const upload = (kind: string, file: File) => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      return app.request(`/cases/${id}/documents`, { method: "POST", body: form });
    };
    return { upload, llm, db };
  };

  it("stores the passport facts from a PNG without calling a model", async () => {
    const { upload, llm, db } = await setup();
    const res = await upload("passport", png(passportPng()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "passport", fields: 9, lowConfidence: 0 });
    expect(llm.calls).toHaveLength(0);
    await db.close();
  }, 30000);

  it("refuses a scanned image for any other document", async () => {
    const { upload, llm, db } = await setup();
    const res = await upload("degree", png(passportPng(), "degree.png"));
    expect(res.status).toBe(422);
    expect(llm.calls).toHaveLength(0);
    await db.close();
  });

  it("returns 422 for an image with no readable text", async () => {
    const { upload, db } = await setup();
    // A valid 1x1 PNG has nothing to read.
    const tiny = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
    const res = await upload("passport", png(tiny));
    expect(res.status).toBe(422);
    await db.close();
  }, 30000);
});
