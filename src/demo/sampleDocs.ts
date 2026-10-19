// Synthetic John Doe documents. Shared by the tests, `npm run samples` and the "Fill in demo info" button.
import { checkDigit } from "../privacy/mrz";

export interface PassportSpec {
  country: string;
  surname: string;
  given: string;
  number: string;
  dob: string;
  sex: "F" | "M";
  expiry: string;
}

const DEMO: PassportSpec = {
  country: "UTO",
  surname: "DOE",
  given: "JOHN MICHAEL",
  number: "L898902C3",
  dob: "940812",
  sex: "M",
  expiry: "270115",
};

/** Builds a TD3 MRZ with correct ICAO check digits. */
export function buildMrz(p: PassportSpec): [string, string] {
  const line1 = `P<${p.country}${p.surname}<<${p.given.replace(/ /g, "<")}`.padEnd(44, "<");
  const number = p.number.padEnd(9, "<");
  const personal = "".padEnd(14, "<");
  const head =
    `${number}${checkDigit(number)}${p.country}${p.dob}${checkDigit(p.dob)}${p.sex}` +
    `${p.expiry}${checkDigit(p.expiry)}${personal}${checkDigit(personal)}`;
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 43);
  return [line1, head + checkDigit(composite)];
}

export function demoPassportText(over: Partial<PassportSpec> = {}): string {
  const [l1, l2] = buildMrz({ ...DEMO, ...over });
  return ["REPUBLIC OF UTOPIA", "PASSPORT", l1, l2].join("\n");
}

export const DEGREE_TEXT = [
  "UTOPIA UNIVERSITY",
  "This certifies that",
  "John Doe",
  "has been awarded the degree of",
  "Bachelor of Science in Computer Science",
  "Conferred on May 20, 2012",
  "Student ID: S2008-4471",
].join("\n");

export const OFFER_LETTER_TEXT = [
  "Utopia Technologies Inc.",
  "Offer of Employment",
  "",
  "Dear John Doe,",
  "",
  "We are pleased to offer you the position of Software Engineer.",
  "Your duties will include designing and building backend services.",
  "Your annual salary will be $95,000.",
  "Your start date will be October 1, 2026.",
  "Your worksite will be 100 Main Street, Springfield.",
  "",
  "Contact: hr@utopiatech.example or (212) 555-0147.",
  "Your SSN on file is 123-45-6789.",
].join("\n");

export const DEMO_CASE_LABEL = "Doe H-1B";

/** The three demo documents in upload order. */
export const DEMO_DOCUMENTS = [
  { kind: "passport", filename: "passport.txt", text: demoPassportText() },
  { kind: "degree", filename: "degree.txt", text: DEGREE_TEXT },
  { kind: "offer_letter", filename: "offer-letter.txt", text: OFFER_LETTER_TEXT },
] as const;
