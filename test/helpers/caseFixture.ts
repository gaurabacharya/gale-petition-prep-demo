import type { Db } from "../../src/db/db";
import type { DocKind, FieldInput } from "../../src/db/fields";
import { createCase, saveExtraction } from "../../src/repo/cases";

const f = (name: string, value: string, source: FieldInput["source"] = "llm"): FieldInput => ({
  name,
  value,
  quote: value,
  source,
  confidence: "high",
});

export const BASE_FIELDS: Record<DocKind, FieldInput[]> = {
  passport: [
    f("surname", "ERIKSSON", "mrz"),
    f("given_names", "ANNA MARIA", "mrz"),
    f("passport_number", "L898902C3", "mrz"),
    f("nationality", "UTO", "mrz"),
    f("date_of_birth", "1994-08-12", "mrz"),
    f("sex", "F", "mrz"),
    f("expiry_date", "2028-06-01", "mrz"),
    f("issuing_country", "UTO", "mrz"),
    f("mrz_check_digits", "ok", "mrz"),
  ],
  degree: [
    f("name", "Anna Eriksson"),
    f("degree", "Bachelor of Science"),
    f("field_of_study", "Computer Science"),
    f("institution", "Utopia University"),
    f("date_conferred", "May 20, 2012"),
  ],
  offer_letter: [
    f("name", "Anna Eriksson"),
    f("job_title", "Software Engineer"),
    f("duties", "designing and building backend services"),
    f("annual_salary", "$95,000"),
    f("start_date", "October 1, 2026"),
    f("employer", "Utopia Technologies Inc."),
    f("worksite_location", "100 Main Street, Springfield"),
  ],
};

/** A case with all three documents saved. Pass `override` to replace one document's fields. */
export async function seedCase(
  db: Db,
  opts: { approve?: boolean; override?: Partial<Record<DocKind, FieldInput[]>> } = {},
): Promise<string> {
  const { id } = await createCase(db, "Eriksson H-1B");
  for (const kind of ["passport", "degree", "offer_letter"] as const) {
    await saveExtraction(db, {
      caseId: id,
      kind,
      filename: `${kind}.txt`,
      rawText: "RAW",
      fields: opts.override?.[kind] ?? BASE_FIELDS[kind],
    });
  }
  if (opts.approve) await db.query("update fields set status = 'approved' where case_id = $1", [id]);
  return id;
}
