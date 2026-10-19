import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { DocKind } from "../db/fields";
import type { FieldRow } from "../repo/cases";
import { winAnsiSafe, wrap } from "./pdfText";

interface SheetFact {
  readonly docKind: DocKind;
  readonly name: string;
  readonly label: string;
}

/** The same fact may feed more than one section, as it does on the real forms. */
export const SHEET_SECTIONS: readonly { title: string; fields: readonly SheetFact[] }[] = [
  {
    title: "I-129 Part 1: Petitioner",
    fields: [{ docKind: "offer_letter", name: "employer", label: "Employer" }],
  },
  {
    title: "I-129 Part 3: Beneficiary",
    fields: [
      { docKind: "passport", name: "surname", label: "Family name" },
      { docKind: "passport", name: "given_names", label: "Given names" },
      { docKind: "passport", name: "date_of_birth", label: "Date of birth" },
      { docKind: "passport", name: "sex", label: "Sex" },
      { docKind: "passport", name: "nationality", label: "Country of citizenship" },
      { docKind: "passport", name: "issuing_country", label: "Passport issuing country" },
      { docKind: "passport", name: "passport_number", label: "Passport number" },
      { docKind: "passport", name: "expiry_date", label: "Passport expiry" },
    ],
  },
  {
    title: "I-129 Part 5 and LCA: Employment",
    fields: [
      { docKind: "offer_letter", name: "job_title", label: "Job title" },
      { docKind: "offer_letter", name: "duties", label: "Duties" },
      { docKind: "offer_letter", name: "annual_salary", label: "Annual salary" },
      { docKind: "offer_letter", name: "start_date", label: "Start date" },
      { docKind: "offer_letter", name: "worksite_location", label: "Worksite location" },
      { docKind: "offer_letter", name: "employer", label: "Employer" },
    ],
  },
  {
    title: "I-129 H Supplement: Education",
    fields: [
      { docKind: "degree", name: "name", label: "Name on degree" },
      { docKind: "degree", name: "degree", label: "Degree" },
      { docKind: "degree", name: "field_of_study", label: "Field of study" },
      { docKind: "degree", name: "institution", label: "Institution" },
      { docKind: "degree", name: "date_conferred", label: "Date conferred" },
    ],
  },
];

const PAGE = { width: 612, height: 792, margin: 54 };
const LABEL_WIDTH = 150;

/** Built only from the approved rows it is given. No model call. */
export async function buildDataSheet(input: {
  caseLabel: string;
  beneficiary: string;
  fields: readonly FieldRow[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const approved = input.fields.filter((f) => f.status === "approved");

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const ensure = (needed: number) => {
    if (y - needed < PAGE.margin) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };
  const line = (text: string, x: number, f: PDFFont, size: number, color = rgb(0.1, 0.1, 0.15)) => {
    page.drawText(winAnsiSafe(text, f), { x, y, size, font: f, color });
  };

  line("Petition data sheet", PAGE.margin, bold, 18);
  y -= 22;
  line(`Beneficiary: ${input.beneficiary}`, PAGE.margin, font, 11);
  y -= 15;
  line(`Case: ${input.caseLabel}`, PAGE.margin, font, 11);
  y -= 30;

  for (const section of SHEET_SECTIONS) {
    const facts = section.fields.flatMap((fact) => {
      const row = approved.find((r) => r.docKind === fact.docKind && r.name === fact.name);
      return row && row.value.trim() ? [{ label: fact.label, value: row.value }] : [];
    });
    if (facts.length === 0) continue;

    ensure(40);
    line(section.title, PAGE.margin, bold, 13);
    y -= 20;
    for (const fact of facts) {
      const lines = wrap(winAnsiSafe(fact.value, font), font, 10, PAGE.width - PAGE.margin * 2 - LABEL_WIDTH);
      ensure(14);
      line(fact.label, PAGE.margin, bold, 10);
      for (const [i, text] of lines.entries()) {
        if (i > 0) ensure(14);
        line(text, PAGE.margin + LABEL_WIDTH, font, 10);
        y -= 14;
      }
      y -= 2;
    }
    y -= 12;
  }

  return pdf.save();
}
