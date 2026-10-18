// Writes the synthetic sample documents to samples/ from the test fixtures: `npm run samples`.
import { mkdirSync, writeFileSync } from "node:fs";
import { DEGREE_TEXT } from "../test/fixtures/degree";
import { OFFER_LETTER_TEXT } from "../test/fixtures/offerLetter";
import { demoPassportText } from "../test/fixtures/passport";

mkdirSync("samples", { recursive: true });
const files: Record<string, string> = {
  "passport.txt": demoPassportText(),
  "degree.txt": DEGREE_TEXT,
  "offer-letter.txt": OFFER_LETTER_TEXT,
};
for (const [name, text] of Object.entries(files)) writeFileSync(`samples/${name}`, `${text}\n`);
console.log(`Wrote ${Object.keys(files).map((n) => `samples/${n}`).join(", ")}`);
