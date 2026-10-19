import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildLetterPdf } from "../../src/outputs/letterPdf";

describe("buildLetterPdf", () => {
  it("returns a one-page PDF for a short letter", async () => {
    const bytes = await buildLetterPdf({ body: "Dear Officer:\n\nThis is a letter. [DATE]" });
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("adds pages for a long letter", async () => {
    const paragraph = "The position requires specialized knowledge in computer science. ".repeat(20);
    const bytes = await buildLetterPdf({ body: Array(12).fill(paragraph).join("\n\n") });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it("does not throw on characters the standard font cannot draw", async () => {
    await expect(buildLetterPdf({ body: "Name: 李雷 → ✓" })).resolves.toBeInstanceOf(Uint8Array);
  });
});
