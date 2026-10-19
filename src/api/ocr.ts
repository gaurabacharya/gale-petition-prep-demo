import { createRequire } from "node:module";
import { dirname } from "node:path";
import { createWorker, PSM, type Worker } from "tesseract.js";

const require = createRequire(import.meta.url);
// English data ships in @tesseract.js-data/eng, so OCR never fetches anything from a CDN.
const LANG_PATH = dirname(require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"));

let worker: Promise<Worker> | undefined;

function getWorker(): Promise<Worker> {
  worker ??= createWorker("eng", 1, { langPath: LANG_PATH, gzip: true, cacheMethod: "none" }).then(async (w) => {
    // A passport's machine-readable zone only uses A-Z, 0-9 and `<`, so refuse every other glyph.
    await w.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    return w;
  });
  return worker;
}

/** Cleans OCR output into MRZ-shaped lines: upper case, no spaces, look-alike chevrons read as `<`. */
export function normaliseOcr(text: string): string {
  return text
    .toUpperCase()
    .replace(/[«‹〈]/g, "<")
    .split("\n")
    .map((line) => line.replace(/\s+/g, ""))
    .filter((line) => line.length > 0)
    .join("\n");
}

const TO_DIGIT: Record<string, string> = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8" };
const TO_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B" };
const map = (s: string, table: Record<string, string>) => [...s].map((c) => table[c] ?? c).join("");

/**
 * Tesseract confuses look-alikes in the MRZ: `0` and `O`, and a run of `<` can come back as `KLLL`. The MRZ
 * has a fixed layout, so fix each character by what its position can hold. The check digits are still
 * validated afterwards by the MRZ parser, so a wrong repair fails loudly rather than slipping through.
 */
export function repairMrz(text: string): string {
  const lines = text.split("\n").filter((l) => l.length >= 36);
  if (lines.length < 2) return text;
  const [first, second] = lines.slice(-2) as [string, string];

  // Line 1: type, country, then SURNAME<<GIVEN<NAMES, then filler.
  const body = first.replace(/^P<?/, "");
  const country = map(body.slice(0, 3), TO_LETTER);
  const [surname = "", given = ""] = body.slice(3).split("<<");
  const line1 = `P<${country}${map(surname, TO_LETTER)}<<${map(given, TO_LETTER)}`.padEnd(44, "<").slice(0, 44);

  // Line 2: number, check, country, birth date, check, sex, expiry, check, personal number, check, check.
  const l2 = second.padEnd(44, "<").slice(0, 44);
  const at = (from: number, to: number, fix: (s: string) => string) => fix(l2.slice(from, to));
  const digits = (s: string) => map(s, TO_DIGIT);
  const letters = (s: string) => map(s, TO_LETTER);
  const filler = (s: string) => s.replace(/[KL]/g, "<");
  const line2 =
    at(0, 9, (s) => s) +
    at(9, 10, digits) +
    at(10, 13, letters) +
    at(13, 20, digits) +
    at(20, 21, letters) +
    at(21, 28, digits) +
    at(28, 42, (s) => (/^[<KL]+$/.test(s) ? "<".repeat(14) : filler(s))) +
    at(42, 44, digits);
  return `${line1}\n${line2}`;
}

/** Reads text out of a scanned image on this server. Nothing is sent anywhere. */
export async function ocrToText(bytes: Uint8Array): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(Buffer.from(bytes));
  return repairMrz(normaliseOcr(data.text));
}

export async function closeOcr(): Promise<void> {
  const w = await worker;
  worker = undefined;
  await w?.terminate();
}
