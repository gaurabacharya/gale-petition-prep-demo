import { createRequire } from "node:module";
import { dirname } from "node:path";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { normaliseOcr, repairMrz } from "./mrzRepair";

export { normaliseOcr, repairMrz };

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
