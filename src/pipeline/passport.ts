import { Effect, Either } from "effect";
import type { FieldInput } from "../db/fields";
import { DemoModeRejectedError, UnreadableDocumentError } from "../errors";
import { parseMrz, type MrzChecks, type MrzField } from "../privacy/mrz";

const CHECK_NAMES: Record<keyof MrzChecks, string> = {
  passportNumber: "passport_number",
  dateOfBirth: "date_of_birth",
  expiryDate: "expiry_date",
  composite: "composite",
};

const mrzField = (name: string, f: MrzField): FieldInput => ({
  name,
  value: f.value,
  quote: f.source,
  source: "mrz",
  confidence: "high",
});

function checkDigitsField(checks: MrzChecks): FieldInput {
  const failed = (Object.keys(CHECK_NAMES) as (keyof MrzChecks)[]).filter((k) => !checks[k]).map((k) => CHECK_NAMES[k]);
  return {
    name: "mrz_check_digits",
    value: failed.length === 0 ? "ok" : `failed: ${failed.join(", ")}`,
    quote: "",
    source: "mrz",
    confidence: "high",
  };
}

/** Local only: the passport text never reaches a model. */
export function extractPassport(
  text: string,
  opts: { readonly demoMode: boolean },
): Effect.Effect<FieldInput[], UnreadableDocumentError | DemoModeRejectedError> {
  const parsed = parseMrz(text);
  if (Either.isLeft(parsed)) return Effect.fail(new UnreadableDocumentError({ message: parsed.left.message }));
  const r = parsed.right;
  if (opts.demoMode && r.issuingCountry.value !== "UTO") {
    return Effect.fail(new DemoModeRejectedError({ message: "Demo mode accepts only synthetic UTO specimen passports" }));
  }
  return Effect.succeed([
    mrzField("surname", r.surname),
    mrzField("given_names", r.givenNames),
    mrzField("passport_number", r.passportNumber),
    mrzField("nationality", r.nationality),
    mrzField("date_of_birth", r.dateOfBirth),
    mrzField("sex", r.sex),
    mrzField("expiry_date", r.expiryDate),
    mrzField("issuing_country", r.issuingCountry),
    checkDigitsField(r.checks),
  ]);
}
