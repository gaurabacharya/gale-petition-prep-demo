import type { DocKind } from "../db/fields";
import type { FieldRow } from "../repo/cases";
import { nameTokens, parseDate, parseSalary } from "./parse";

export type CheckLevel = "problem" | "warning" | "for_attorney";

export interface Check {
  readonly id: string;
  readonly level: CheckLevel;
  readonly message: string;
  readonly fieldRefs: readonly { docKind: DocKind; name: string }[];
}

const KINDS: readonly DocKind[] = ["passport", "degree", "offer_letter"];
const LABEL: Record<DocKind, string> = { passport: "Passport", degree: "Degree", offer_letter: "Offer letter" };
const ORDER: Record<CheckLevel, number> = { problem: 0, warning: 1, for_attorney: 2 };

const addMonthsUtc = (d: Date, months: number): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));

/** Pure consistency checks over a case's fields; problems first, then warnings, then attorney items. */
export function runChecks(fields: readonly FieldRow[], documents: readonly { kind: DocKind }[]): Check[] {
  const get = (docKind: DocKind, name: string) => fields.find((f) => f.docKind === docKind && f.name === name);
  const val = (docKind: DocKind, name: string) => get(docKind, name)?.value.trim() ?? "";
  const ref = (docKind: DocKind, name: string) => ({ docKind, name });
  const checks: Check[] = [];

  const present = new Set(documents.map((d) => d.kind));
  for (const kind of KINDS) {
    if (!present.has(kind)) {
      checks.push({
        id: `missing_document_${kind}`,
        level: "problem",
        message: `${LABEL[kind]} has not been uploaded.`,
        fieldRefs: [],
      });
    }
  }

  const passportTokens = [...nameTokens(val("passport", "given_names")), ...nameTokens(val("passport", "surname"))];
  const surnameTokens = nameTokens(val("passport", "surname"));
  if (passportTokens.length > 0) {
    for (const kind of ["degree", "offer_letter"] as const) {
      const tokens = nameTokens(val(kind, "name"));
      if (tokens.length === 0) continue;
      const same = tokens.length === passportTokens.length && tokens.every((t) => passportTokens.includes(t));
      if (same) continue;
      const shorter =
        tokens.every((t) => passportTokens.includes(t)) && surnameTokens.every((t) => tokens.includes(t));
      checks.push({
        id: `name_mismatch_${kind}`,
        level: shorter ? "warning" : "problem",
        message: shorter
          ? `${LABEL[kind]} name "${val(kind, "name")}" is shorter than the passport name (possibly a missing middle name).`
          : `${LABEL[kind]} name "${val(kind, "name")}" does not match the passport name.`,
        fieldRefs: [ref(kind, "name"), ref("passport", "given_names"), ref("passport", "surname")],
      });
    }
  }

  const expiry = parseDate(val("passport", "expiry_date"));
  const start = parseDate(val("offer_letter", "start_date"));
  if (expiry && start) {
    const refs = [ref("passport", "expiry_date"), ref("offer_letter", "start_date")];
    if (expiry < start) {
      checks.push({ id: "passport_validity", level: "problem", message: "The passport expires before the start date.", fieldRefs: refs });
    } else if (expiry < addMonthsUtc(start, 6)) {
      checks.push({ id: "passport_validity", level: "warning", message: "The passport expires within 6 months of the start date.", fieldRefs: refs });
    }
  }

  const mrz = val("passport", "mrz_check_digits");
  if (mrz && mrz !== "ok") {
    checks.push({ id: "mrz_check_digits", level: "problem", message: `Passport MRZ check digits ${mrz}.`, fieldRefs: [ref("passport", "mrz_check_digits")] });
  }

  if (present.has("offer_letter") && parseSalary(val("offer_letter", "annual_salary")) === undefined) {
    checks.push({ id: "salary", level: "problem", message: "The offer letter has no usable annual salary.", fieldRefs: [ref("offer_letter", "annual_salary")] });
  }

  const low = fields.filter((f) => f.confidence === "low" || f.value.trim() === "");
  if (low.length > 0) {
    checks.push({
      id: "low_confidence",
      level: "warning",
      message: `${low.length} field(s) are missing or their quote was not found in the document: ${low.map((f) => f.name).join(", ")}.`,
      fieldRefs: low.map((f) => ref(f.docKind, f.name)),
    });
  }

  checks.push(
    {
      id: "specialty_occupation",
      level: "for_attorney",
      message: "Confirm the degree field relates to the role.",
      fieldRefs: [ref("degree", "field_of_study"), ref("offer_letter", "job_title")],
    },
    {
      id: "prevailing_wage",
      level: "for_attorney",
      message: "Compare the salary to the prevailing wage level for the job code and area (manual in the demo).",
      fieldRefs: [ref("offer_letter", "annual_salary")],
    },
  );

  return checks.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

export const countDiscrepancies = (checks: readonly Check[]): number =>
  checks.filter((c) => c.level !== "for_attorney").length;
