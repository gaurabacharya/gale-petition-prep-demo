// Renders the John Doe sample documents from src/demo/sampleDocs.ts: `npm run samples`.
// passport.png is a drawn passport page (a scan), degree.pdf and offer-letter.pdf have text layers.
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DEGREE_TEXT, OFFER_LETTER_TEXT, demoPassportText } from "../src/demo/sampleDocs";

const OUT = ["samples", "web/public/samples"];
const write = (name: string, bytes: Uint8Array) => {
  for (const dir of OUT) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}`, bytes);
  }
};

async function degreePdf(): Promise<Uint8Array> {
  const [university, , name, , program, conferred, studentId] = DEGREE_TEXT.split("\n");
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.12, 0.14, 0.2);
  page.drawRectangle({ x: 36, y: 36, width: 540, height: 720, borderColor: ink, borderWidth: 3 });
  page.drawRectangle({ x: 46, y: 46, width: 520, height: 700, borderColor: ink, borderWidth: 0.75 });
  const centred = (text: string, y: number, size: number, font = serif) =>
    page.drawText(text, { x: (612 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: ink });
  centred(university!, 650, 30, bold);
  centred("This certifies that", 560, 16);
  centred(name!, 500, 34, bold);
  centred("has been awarded the degree of", 440, 16);
  centred(program!, 390, 22, bold);
  centred(conferred!, 320, 16);
  centred(studentId!, 120, 12);
  return doc.save();
}

async function offerLetterPdf(): Promise<Uint8Array> {
  const lines = OFFER_LETTER_TEXT.split("\n");
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(0.12, 0.16, 0.24) });
  page.drawText(lines[0]!, { x: 54, y: 760, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(lines[1]!, { x: 54, y: 690, size: 22, font: bold, color: rgb(0.12, 0.14, 0.2) });
  // One drawText per line keeps each sentence intact in the PDF text layer.
  lines.slice(2).forEach((line, i) => {
    page.drawText(line, { x: 54, y: 640 - i * 24, size: 12, font: sans, color: rgb(0.1, 0.1, 0.1) });
  });
  return doc.save();
}

function passportPng(): Uint8Array {
  const [, , mrz1, mrz2] = demoPassportText().split("\n");
  GlobalFonts.registerFromPath("/System/Library/Fonts/Supplemental/Courier New Bold.ttf", "ScanMono");
  const W = 1500;
  const H = 1050;
  const canvas = createCanvas(W, H);
  const g = canvas.getContext("2d");
  g.fillStyle = "#efe9d6";
  g.fillRect(0, 0, W, H);
  // Light grain so it reads as a scan without hurting the MRZ.
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(90, 80, 60, ${Math.random() * 0.06})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  g.strokeStyle = "#2a3a5c";
  g.lineWidth = 6;
  g.strokeRect(30, 30, W - 60, H - 60);
  g.fillStyle = "#2a3a5c";
  g.font = "bold 46px Georgia, serif";
  g.fillText("REPUBLIC OF UTOPIA", 90, 120);
  g.font = "bold 34px Georgia, serif";
  g.fillText("PASSPORT / SPECIMEN", 90, 170);
  g.strokeRect(90, 230, 300, 380); // photo box
  g.font = "24px Georgia, serif";
  g.fillText("PHOTO", 190, 430);
  const rows: [string, string][] = [
    ["Type / Country", "P / UTO"],
    ["Surname", "DOE"],
    ["Given names", "JOHN MICHAEL"],
    ["Passport no.", "L898902C3"],
    ["Date of birth", "12 AUG 1994"],
    ["Sex", "M"],
    ["Date of expiry", "15 JAN 2027"],
  ];
  rows.forEach(([label, value], i) => {
    const y = 262 + i * 54;
    g.fillStyle = "#6b7280";
    g.font = "20px Helvetica, Arial, sans-serif";
    g.fillText(label.toUpperCase(), 450, y);
    g.fillStyle = "#111827";
    g.font = "bold 30px Helvetica, Arial, sans-serif";
    g.fillText(value, 450, y + 32);
  });
  g.fillStyle = "#e4dcc4";
  g.fillRect(30, 740, W - 60, 280);
  g.fillStyle = "#111111";
  g.font = "bold 50px ScanMono, 'Courier New', monospace";
  g.fillText(mrz1!, 78, 840);
  g.fillText(mrz2!, 78, 930);
  return canvas.toBuffer("image/png");
}

write("passport.png", passportPng());
write("degree.pdf", await degreePdf());
write("offer-letter.pdf", await offerLetterPdf());
console.log("Wrote samples/passport.png, samples/degree.pdf, samples/offer-letter.pdf (and web/public/samples/)");
