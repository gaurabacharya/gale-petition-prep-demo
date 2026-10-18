import { Schema } from "effect";

const Extracted = Schema.Struct({ value: Schema.String, quote: Schema.String });

export const DegreeExtraction = Schema.Struct({
  name: Extracted,
  degree: Extracted,
  field_of_study: Extracted,
  institution: Extracted,
  date_conferred: Extracted,
});
export const DEGREE_KEYS = ["name", "degree", "field_of_study", "institution", "date_conferred"] as const;

export const OfferLetterExtraction = Schema.Struct({
  name: Extracted,
  job_title: Extracted,
  duties: Extracted,
  annual_salary: Extracted,
  start_date: Extracted,
  employer: Extracted,
  worksite_location: Extracted,
});
export const OFFER_LETTER_KEYS = [
  "name",
  "job_title",
  "duties",
  "annual_salary",
  "start_date",
  "employer",
  "worksite_location",
] as const;
