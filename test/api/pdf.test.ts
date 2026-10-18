import { Either } from "effect";
import { describe, expect, it } from "vitest";
import { pdfToText } from "../../src/api/pdf";
import { parseMrz } from "../../src/privacy/mrz";
import { demoPassportText } from "../fixtures/passport";
import { makeBlankPdf, makePdf } from "../helpers/pdf";

describe("pdfToText", () => {
  it("extracts text with the MRZ lines still on separate lines", async () => {
    const text = await pdfToText(await makePdf(demoPassportText()));
    expect(text).toContain("ERIKSSON");
    expect(Either.isRight(parseMrz(text))).toBe(true);
  });

  it("returns empty text for a PDF with no text", async () => {
    expect((await pdfToText(await makeBlankPdf())).trim()).toBe("");
  });

  it("throws for bytes that are not a PDF", async () => {
    await expect(pdfToText(new TextEncoder().encode("not a pdf"))).rejects.toThrow();
  });
});
