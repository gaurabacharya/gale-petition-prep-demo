import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pdfToText } from "../../src/api/pdf";
import { buildDataSheet, SHEET_SECTIONS } from "../../src/outputs/dataSheet";
import type { FieldRow } from "../../src/repo/cases";
import { BASE_FIELDS } from "../helpers/caseFixture";

const rows = (over: Record<string, Partial<FieldRow>> = {}): FieldRow[] =>
  (["passport", "degree", "offer_letter"] as const).flatMap((docKind) =>
    BASE_FIELDS[docKind].map((x, i) => ({
      id: `${docKind}-${i}`,
      docKind,
      name: x.name,
      value: x.value,
      quote: x.quote,
      source: x.source,
      confidence: x.confidence,
      status: "approved" as const,
      ...over[`${docKind}.${x.name}`],
    })),
  );

const text = async (fields: FieldRow[]) => {
  const bytes = await buildDataSheet({ caseLabel: "Eriksson H-1B", beneficiary: "Anna Maria Eriksson", fields });
  return { bytes, text: (await pdfToText(bytes)).replace(/\s+/g, " ") };
};

describe("buildDataSheet", () => {
  it("is a PDF with the beneficiary and case label in the header", async () => {
    const { bytes, text: t } = await text(rows());
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
    expect(t).toContain("Anna Maria Eriksson");
    expect(t).toContain("Eriksson H-1B");
  });

  it("lists every approved value under its section title", async () => {
    const { text: t } = await text(rows());
    for (const section of SHEET_SECTIONS) expect(t).toContain(section.title);
    for (const v of ["Utopia Technologies Inc.", "L898902C3", "Software Engineer", "$95,000", "Computer Science"]) {
      expect(t).toContain(v);
    }
  });

  it("omits pending fields and the MRZ check digits row", async () => {
    const { text: t } = await text(rows({ "offer_letter.annual_salary": { status: "pending", value: "$12,345" } }));
    expect(t).not.toContain("12,345");
    expect(t).not.toContain("mrz_check_digits");
    expect(t).not.toContain("check digits");
  });

  it("does not throw on characters the standard font cannot encode", async () => {
    const { text: t } = await text(
      rows({ "passport.surname": { value: "Řezníková" }, "passport.given_names": { value: "Søren 李" } }),
    );
    expect(t).toContain("?");
    expect(t).toContain("zn");
  });

  it("flows long text onto another page", async () => {
    const long = "word ".repeat(600).trim();
    const { bytes, text: t } = await text(rows({ "offer_letter.duties": { value: long } }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    expect(t.match(/word/g)?.length).toBeGreaterThanOrEqual(600);
  });
});
