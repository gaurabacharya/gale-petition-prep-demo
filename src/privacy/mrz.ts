import { Data, Either } from "effect";

export class MrzError extends Data.TaggedError("MrzError")<{
  readonly reason: "not_found" | "bad_format";
  readonly message: string;
}> {}

export interface MrzField {
  readonly value: string;
  readonly source: string;
}

export interface MrzChecks {
  readonly passportNumber: boolean;
  readonly dateOfBirth: boolean;
  readonly expiryDate: boolean;
  readonly composite: boolean;
}

export interface MrzResult {
  readonly issuingCountry: MrzField;
  readonly surname: MrzField;
  readonly givenNames: MrzField;
  readonly passportNumber: MrzField;
  readonly nationality: MrzField;
  readonly dateOfBirth: MrzField;
  readonly sex: MrzField;
  readonly expiryDate: MrzField;
  readonly checks: MrzChecks;
}

const WEIGHTS = [7, 3, 1];
const MRZ_LINE = /^[A-Z0-9<]{44}$/;

function charValue(c: string): number {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return 0; // "<" filler
}

export function checkDigit(field: string): number {
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += charValue(field[i]) * WEIGHTS[i % 3];
  return sum % 10;
}

function digitMatches(field: string, digit: string): boolean {
  return /^\d$/.test(digit) && checkDigit(field) === Number(digit);
}

function findMrzLines(text: string): [string, string] | undefined {
  // Drop blank lines, and keep only the last 44 characters of a line so a label before an MRZ line is ignored.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, "").toUpperCase())
    .filter((l) => l.length > 0)
    .map((l) => (l.length > 44 ? l.slice(-44) : l));
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith("P") && MRZ_LINE.test(lines[i]) && MRZ_LINE.test(lines[i + 1])) {
      return [lines[i], lines[i + 1]];
    }
  }
  return undefined;
}

const clean = (s: string) => s.replace(/</g, " ").replace(/\s+/g, " ").trim();

function isoDate(source: string, century: number): string | undefined {
  if (!/^\d{6}$/.test(source)) return undefined;
  const month = source.slice(2, 4);
  const day = source.slice(4, 6);
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return undefined;
  return `${century + Number(source.slice(0, 2))}-${month}-${day}`;
}

export function parseMrz(
  text: string,
  referenceYear: number = new Date().getFullYear(),
): Either.Either<MrzResult, MrzError> {
  const lines = findMrzLines(text);
  if (!lines) {
    return Either.left(new MrzError({ reason: "not_found", message: "No two-line TD3 MRZ found" }));
  }
  const [l1, l2] = lines;

  const dobSource = l2.slice(13, 19);
  const expirySource = l2.slice(21, 27);
  const dob = isoDate(dobSource, Number(dobSource.slice(0, 2)) > referenceYear % 100 ? 1900 : 2000);
  const expiry = isoDate(expirySource, 2000);
  if (dob === undefined || expiry === undefined) {
    return Either.left(new MrzError({ reason: "bad_format", message: "MRZ date is not a valid YYMMDD" }));
  }

  const names = l1.slice(5).split("<<");
  const sex = l2.slice(20, 21);

  return Either.right({
    issuingCountry: { value: l1.slice(2, 5), source: l1.slice(2, 5) },
    surname: { value: clean(names[0] ?? ""), source: l1.slice(5) },
    givenNames: { value: clean(names.slice(1).join(" ")), source: l1.slice(5) },
    passportNumber: { value: l2.slice(0, 9).replace(/</g, ""), source: l2.slice(0, 9) },
    nationality: { value: l2.slice(10, 13), source: l2.slice(10, 13) },
    dateOfBirth: { value: dob, source: dobSource },
    sex: { value: sex === "<" ? "X" : sex, source: sex },
    expiryDate: { value: expiry, source: expirySource },
    checks: {
      passportNumber: digitMatches(l2.slice(0, 9), l2[9]),
      dateOfBirth: digitMatches(dobSource, l2[19]),
      expiryDate: digitMatches(expirySource, l2[27]),
      composite: digitMatches(l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43), l2[43]),
    },
  });
}
