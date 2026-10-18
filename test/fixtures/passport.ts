import { checkDigit } from "../../src/privacy/mrz";

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
  surname: "ERIKSSON",
  given: "ANNA MARIA",
  number: "L898902C3",
  dob: "940812",
  sex: "F",
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
