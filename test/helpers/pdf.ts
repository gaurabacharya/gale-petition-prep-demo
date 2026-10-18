import { PDFDocument, StandardFonts } from "pdf-lib";

/** A one-page PDF with a text layer, one line of `text` per row. */
export async function makePdf(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Courier);
  text.split("\n").forEach((line, i) => page.drawText(line, { x: 20, y: 800 - i * 14, size: 8, font }));
  return new Uint8Array(await pdf.save());
}

/** A one-page PDF with no text, like a scan with no text layer. */
export async function makeBlankPdf(): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  return new Uint8Array(await pdf.save());
}
