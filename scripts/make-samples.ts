// Writes the synthetic sample documents to samples/ from src/demo/sampleDocs.ts: `npm run samples`.
import { mkdirSync, writeFileSync } from "node:fs";
import { DEMO_DOCUMENTS } from "../src/demo/sampleDocs";

mkdirSync("samples", { recursive: true });
for (const d of DEMO_DOCUMENTS) writeFileSync(`samples/${d.filename}`, `${d.text}\n`);
console.log(`Wrote ${DEMO_DOCUMENTS.map((d) => `samples/${d.filename}`).join(", ")}`);
