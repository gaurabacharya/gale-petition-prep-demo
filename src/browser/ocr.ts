import { createWorker, PSM, type Worker } from "tesseract.js";
import { normaliseOcr, repairMrz } from "../api/mrzRepair";

export { normaliseOcr, repairMrz };

let worker: Promise<Worker> | undefined;

function getWorker(): Promise<Worker> {
  // The worker, the OCR engine and the English model are copied into the site by web/vite.pages.config.ts,
  // so the scan is read without fetching anything from a CDN.
  const base = new URL(import.meta.env.BASE_URL, window.location.href).href;
  worker ??= createWorker("eng", 1, {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract`,
    langPath: `${base}tessdata`,
    gzip: true,
    cacheMethod: "none",
  }).then(async (w) => {
    await w.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    return w;
  });
  return worker;
}

/** Browser twin of ./ocr.ts: reads the scan inside the visitor's browser. Nothing is sent anywhere. */
export async function ocrToText(bytes: Uint8Array): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(new Blob([new Uint8Array(bytes)]));
  return repairMrz(normaliseOcr(data.text));
}

export async function closeOcr(): Promise<void> {
  const w = await worker;
  worker = undefined;
  await w?.terminate();
}
