import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { redact, restore } from "../../src/privacy/redact";

const SAMPLE = [
  "Dear John Michael Doe,",
  "SSN: 123-45-6789. A-number: A123456789.",
  "Email anna.eriksson@example.com or call (212) 555-0147.",
  "Passport No. L898902C3. Date of birth: 1974-08-12. Student ID: S2019-4471.",
  "Position: Software Engineer. Salary: $95,000.",
].join("\n");

const SENSITIVE = [
  "123-45-6789",
  "A123456789",
  "anna.eriksson@example.com",
  "(212) 555-0147",
  "L898902C3",
  "1974-08-12",
  "S2019-4471",
];

describe("redact", () => {
  it("replaces every sensitive value with a token", () => {
    const { text, counts } = redact(SAMPLE);
    for (const value of SENSITIVE) expect(text).not.toContain(value);
    for (const token of ["SSN_1", "A_NUMBER_1", "EMAIL_1", "PHONE_1", "PASSPORT_NO_1", "DOB_1", "STUDENT_ID_1"]) {
      expect(text).toContain(`[[${token}]]`);
    }
    expect(counts).toEqual({ SSN: 1, A_NUMBER: 1, EMAIL: 1, PHONE: 1, PASSPORT_NO: 1, DOB: 1, STUDENT_ID: 1 });
  });

  it("keeps names, job title and salary", () => {
    const { text } = redact(SAMPLE);
    expect(text).toContain("John Michael Doe");
    expect(text).toContain("Software Engineer");
    expect(text).toContain("$95,000");
  });

  it("round-trips losslessly", () => {
    const { text, vault } = redact(SAMPLE);
    expect(restore(text, vault)).toBe(SAMPLE);
  });

  it("reuses one token for repeated values and counts every occurrence", () => {
    const { text, counts } = redact("SSN 123-45-6789 and again 123-45-6789 plus 987-65-4321");
    expect(text).toBe("SSN [[SSN_1]] and again [[SSN_1]] plus [[SSN_2]]");
    expect(counts.SSN).toBe(3);
  });

  it("leaves text with nothing sensitive unchanged", () => {
    const input = "The role is a Software Engineer paying $95,000 a year.";
    const { text, vault, counts } = redact(input);
    expect(text).toBe(input);
    expect(counts).toEqual({});
    expect(restore(text, vault)).toBe(input);
  });

  it("does not redact ordinary text that mentions a passport", () => {
    const input = "Passport expires 2027-01-01 and the student identification was checked.";
    expect(redact(input).text).toBe(input);
  });
});

describe("restore", () => {
  it("leaves token-like text that is not in the vault unchanged", () => {
    const { vault } = redact("SSN 123-45-6789");
    expect(restore("Model wrote [[SSN_9]] and [[SSN_1]]", vault)).toBe("Model wrote [[SSN_9]] and 123-45-6789");
  });
});

describe("Vault", () => {
  it("does not expose values when serialised or inspected", () => {
    const { vault } = redact("SSN 123-45-6789");
    expect(JSON.stringify(vault)).toBe('"[vault]"');
    expect(inspect(vault)).not.toContain("123-45-6789");
  });
});

describe("redact: broader formats", () => {
  it.each([
    ["Date of Birth: 12 Jan 1990", "12 Jan 1990"],
    ["DOB: 4 March 1990", "4 March 1990"],
    ["DOB 04-Mar-1990", "04-Mar-1990"],
    ["Date of birth: 1990/03/04", "1990/03/04"],
    ["Date of birth: 04.03.1990", "04.03.1990"],
  ])("redacts the date of birth in %s", (input, value) => {
    const { text, vault } = redact(input);
    expect(text).not.toContain(value);
    expect(text).toContain("[[DOB_1]]");
    expect(restore(text, vault)).toBe(input);
  });

  it.each(["+44 20 7946 0958", "+91 98765 43210"])("redacts the international phone %s", (phone) => {
    const { text, vault } = redact(`Call ${phone} today`);
    expect(text).toBe("Call [[PHONE_1]] today");
    expect(restore(text, vault)).toBe(`Call ${phone} today`);
  });

  it("redacts an SSN written without dashes after a label", () => {
    const { text } = redact("SSN 123456789 on file");
    expect(text).toBe("SSN [[SSN_1]] on file");
  });

  it.each(["A# 123-456-789", "Alien Number: A123456789"])("redacts the A-number in %s", (input) => {
    const { text } = redact(input);
    expect(text).toContain("[[A_NUMBER_1]]");
    expect(text).not.toMatch(/\d{3}/);
  });

  it("redacts a passport number that contains a hyphen", () => {
    const { text } = redact("Passport No: AB-1234567.");
    expect(text).toBe("Passport No: [[PASSPORT_NO_1]].");
  });

  it("does not redact an unlabelled nine-digit number", () => {
    const input = "Case 123456789 was filed.";
    expect(redact(input).text).toBe(input);
  });
});

describe("redact: adversarial input", () => {
  it("handles a very long run of letters in linear time", { timeout: 5000 }, () => {
    const started = Date.now();
    const input = "a".repeat(200_000);
    expect(redact(input).text).toBe(input);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("handles a very long run of digits and separators in linear time", { timeout: 5000 }, () => {
    const input = "1-".repeat(100_000);
    expect(redact(input).text).toBe(input);
  });

  it("still redacts a normal email next to a long run", () => {
    const { text } = redact(`${"a".repeat(1000)} mail anna.eriksson@example.com`);
    expect(text).toContain("[[EMAIL_1]]");
  });
});

describe("redact: long whitespace after a label", () => {
  it.each(["passport", "student id", "dob", "ssn", "A#"])("is linear after %s", { timeout: 5000 }, (label) => {
    const input = `${label}${" ".repeat(100_000)}x`;
    const started = Date.now();
    redact(input);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
