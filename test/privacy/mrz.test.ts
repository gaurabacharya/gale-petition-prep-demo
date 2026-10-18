import { readFileSync } from "node:fs";
import { Either } from "effect";
import { describe, expect, it } from "vitest";
import { checkDigit, parseMrz } from "../../src/privacy/mrz";
import {
  SPECIMEN_MRZ_LINE_1 as L1,
  SPECIMEN_MRZ_LINE_2 as L2,
  SPECIMEN_PASSPORT_TEXT,
} from "../fixtures/specimen";

const parse = (text: string) => parseMrz(text, 2026);

function ok(text: string) {
  const result = parse(text);
  if (Either.isLeft(result)) throw new Error(`expected Right, got ${result.left.reason}`);
  return result.right;
}

describe("checkDigit", () => {
  it("computes the ICAO 7-3-1 check digit", () => {
    expect(checkDigit("L898902C3")).toBe(6);
    expect(checkDigit("740812")).toBe(2);
    expect(checkDigit("120415")).toBe(9);
  });
});

describe("parseMrz", () => {
  it("parses the specimen with every check digit passing", () => {
    const r = ok(SPECIMEN_PASSPORT_TEXT);
    expect(r.checks).toEqual({ passportNumber: true, dateOfBirth: true, expiryDate: true, composite: true });
    expect(r.surname.value).toBe("ERIKSSON");
    expect(r.givenNames.value).toBe("ANNA MARIA");
    expect(r.passportNumber.value).toBe("L898902C3");
    expect(r.issuingCountry.value).toBe("UTO");
    expect(r.nationality.value).toBe("UTO");
    expect(r.sex.value).toBe("F");
    expect(r.dateOfBirth.value).toBe("1974-08-12");
    expect(r.dateOfBirth.source).toBe("740812");
    expect(r.expiryDate.value).toBe("2012-04-15");
  });

  it("fails the passport number digit when the number is altered", () => {
    const r = ok([L1, L2.replace("L898902C3", "L898903C3")].join("\n"));
    expect(r.checks).toEqual({ passportNumber: false, dateOfBirth: true, expiryDate: true, composite: false });
  });

  it("fails the expiry digit when the digit is altered", () => {
    const r = ok([L1, `${L2.slice(0, 27)}8${L2.slice(28)}`].join("\n"));
    expect(r.checks).toEqual({ passportNumber: true, dateOfBirth: true, expiryDate: false, composite: false });
  });

  it("parses MRZ text pasted from a PDF: CRLF, lowercase, stray spaces, header text", () => {
    const text = `Passport\r\n${L1.toLowerCase()}\r\n${L2.slice(0, 22)} ${L2.slice(22)}\r\n`;
    const r = ok(text);
    expect(r.surname.value).toBe("ERIKSSON");
    expect(r.checks.composite).toBe(true);
  });

  it("parses when a blank line separates the two MRZ lines", () => {
    expect(ok(`${L1}\n\n${L2}`).checks.composite).toBe(true);
  });

  it("parses when a label is on the same line as the first MRZ line", () => {
    expect(ok(`MRZ: ${L1}\n${L2}`).surname.value).toBe("ERIKSSON");
  });

  it("returns an empty given-names string for a surname-only passport", () => {
    const r = ok([`P<UTOSMITH`.padEnd(44, "<"), L2].join("\n"));
    expect(r.surname.value).toBe("SMITH");
    expect(r.givenNames.value).toBe("");
  });

  it("returns not_found when there is no MRZ", () => {
    const r = parse("Just a letter\nwith no MRZ");
    expect(Either.isLeft(r) && r.left.reason).toBe("not_found");
  });

  it("returns not_found when only one MRZ line is present", () => {
    const r = parse(L1);
    expect(Either.isLeft(r) && r.left.reason).toBe("not_found");
  });

  it("returns bad_format when a date is not six digits", () => {
    const r = parse([L1, `${L2.slice(0, 13)}74AB12${L2.slice(19)}`].join("\n"));
    expect(Either.isLeft(r) && r.left.reason).toBe("bad_format");
  });

  it("does not reference the model layer", () => {
    expect(readFileSync("src/privacy/mrz.ts", "utf8")).not.toMatch(/llm/i);
  });
});
