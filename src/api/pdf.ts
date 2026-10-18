import { extractText, getDocumentProxy } from "unpdf";

/** Extracts the text layer of a PDF. Throws if the bytes are not a readable PDF. */
export async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
