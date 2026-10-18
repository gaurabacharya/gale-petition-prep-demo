import type { Db } from "./db";

export type DocKind = "passport" | "degree" | "offer_letter";
export type FieldSource = "mrz" | "llm" | "attorney";
export type Confidence = "high" | "low";

export interface FieldInput {
  readonly name: string;
  readonly value: string;
  readonly quote: string;
  readonly source: FieldSource;
  readonly confidence: Confidence;
}

/** Replaces every field of one document kind in a case. New fields are always pending, so a re-upload resets review. */
export async function replaceFields(
  db: Db,
  caseId: string,
  docKind: DocKind,
  fields: readonly FieldInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("delete from fields where case_id = $1 and doc_kind = $2", [caseId, docKind]);
    for (const f of fields) {
      await tx.query(
        "insert into fields (case_id, doc_kind, name, value, quote, source, confidence, status) values ($1, $2, $3, $4, $5, $6, $7, 'pending')",
        [caseId, docKind, f.name, f.value, f.quote, f.source, f.confidence],
      );
    }
  });
}
