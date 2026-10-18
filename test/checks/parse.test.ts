import { describe, expect, it } from "vitest";
import { nameTokens, parseDate, parseSalary } from "../../src/checks/parse";

describe("parseDate", () => {
  it("parses month-name dates", () => {
    expect(parseDate("October 1, 2026")?.toISOString().slice(0, 10)).toBe("2026-10-01");
  });
  it("parses ISO dates", () => {
    expect(parseDate("2027-01-15")?.toISOString().slice(0, 10)).toBe("2027-01-15");
  });
  it("returns undefined for non-dates", () => {
    expect(parseDate("soon")).toBeUndefined();
    expect(parseDate("")).toBeUndefined();
  });
});

describe("parseSalary", () => {
  it("parses common formats", () => {
    expect(parseSalary("$95,000")).toBe(95000);
    expect(parseSalary("95000")).toBe(95000);
    expect(parseSalary("USD 95,000.00")).toBe(95000);
  });
  it("returns undefined without digits", () => {
    expect(parseSalary("negotiable")).toBeUndefined();
    expect(parseSalary("")).toBeUndefined();
  });
});

describe("nameTokens", () => {
  it("uppercases, splits and strips punctuation", () => {
    expect(nameTokens("Anna  Maria O'Neil")).toEqual(["ANNA", "MARIA", "ONEIL"]);
  });
});
