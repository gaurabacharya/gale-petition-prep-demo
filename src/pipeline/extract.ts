import { Effect } from "effect";
import { AuditLog } from "../audit/audit";
import type { Db } from "../db/db";
import type { DocKind, FieldInput } from "../db/fields";
import type { DemoModeRejectedError, UnreadableDocumentError } from "../errors";
import type { LlmClient, LlmInvalidOutputError, LlmProviderError } from "../llm/LlmClient";
import { saveExtraction } from "../repo/cases";
import { extractDegree, extractOfferLetter } from "./model";
import { extractPassport } from "./passport";

export type ExtractionError =
  | UnreadableDocumentError
  | DemoModeRejectedError
  | LlmProviderError
  | LlmInvalidOutputError;

export interface ExtractInput {
  readonly caseId: string;
  readonly kind: DocKind;
  readonly filename: string;
  readonly text: string;
}

export interface ExtractionSummary {
  readonly kind: DocKind;
  readonly fields: number;
  readonly lowConfidence: number;
}

function fieldsFor(
  input: ExtractInput,
  opts: { readonly demoMode: boolean },
): Effect.Effect<FieldInput[], ExtractionError, LlmClient> {
  switch (input.kind) {
    case "passport":
      return extractPassport(input.text, opts);
    case "degree":
      return extractDegree(input.text);
    case "offer_letter":
      return extractOfferLetter(input.text);
  }
}

/** Extracts a document's fields and stores them. Nothing is stored unless extraction fully succeeds. */
export function extractAndStore(
  db: Db,
  opts: { readonly demoMode: boolean },
  input: ExtractInput,
): Effect.Effect<ExtractionSummary, ExtractionError, LlmClient | AuditLog> {
  return Effect.gen(function* () {
    const audit = yield* AuditLog;
    const fields = yield* fieldsFor(input, opts).pipe(
      Effect.tapErrorTag("DemoModeRejectedError", () => audit.record("upload_rejected", {})),
    );
    yield* Effect.tryPromise(() =>
      saveExtraction(db, {
        caseId: input.caseId,
        kind: input.kind,
        filename: input.filename,
        rawText: input.text,
        fields,
      }),
    ).pipe(Effect.orDie);
    const lowConfidence = fields.filter((f) => f.confidence === "low").length;
    yield* audit.record("extraction", { counts: { fields: fields.length, low_confidence: lowConfidence } });
    return { kind: input.kind, fields: fields.length, lowConfidence };
  });
}
