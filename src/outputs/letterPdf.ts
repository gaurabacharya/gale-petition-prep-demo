import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { winAnsiSafe, wrap } from "./pdfText";

const PAGE = { width: 612, height: 792, margin: 72 };
const SIZE = 11;
const LEADING = 15;

/** Renders the letter text as typed: each line break starts a new line, and a blank line adds paragraph space. */
export async function buildLetterPdf(input: { body: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const maxWidth = PAGE.width - PAGE.margin * 2;

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;
  const advance = (by: number) => {
    y -= by;
    if (y < PAGE.margin) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      y = PAGE.height - PAGE.margin;
    }
  };

  for (const raw of input.body.replace(/\r\n?/g, "\n").split("\n")) {
    const text = winAnsiSafe(raw, font).trim();
    if (text === "") {
      advance(LEADING);
      continue;
    }
    for (const line of wrap(text, font, SIZE, maxWidth)) {
      page.drawText(line, { x: PAGE.margin, y, size: SIZE, font, color: rgb(0.1, 0.1, 0.12) });
      advance(LEADING);
    }
  }

  return pdf.save();
}
