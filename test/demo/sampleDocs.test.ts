import { describe, expect, it } from "vitest";
import { DEMO_DOCUMENTS } from "../../src/demo/sampleDocs";
import { parseMrz } from "../../src/privacy/mrz";
import { Either } from "effect";

describe("demo documents", () => {
  it("has a John Doe specimen passport with valid check digits", () => {
    const passport = DEMO_DOCUMENTS.find((d) => d.kind === "passport")!;
    const r = parseMrz(passport.text);
    expect(Either.isRight(r)).toBe(true);
    if (Either.isRight(r)) {
      expect(r.right.issuingCountry.value).toBe("UTO");
      expect(r.right.surname.value).toBe("DOE");
      expect(r.right.givenNames.value).toBe("JOHN MICHAEL");
      expect(Object.values(r.right.checks).every(Boolean)).toBe(true);
    }
  });

  it("covers all three document kinds, naming John Doe", () => {
    expect(DEMO_DOCUMENTS.map((d) => d.kind)).toEqual(["passport", "degree", "offer_letter"]);
    expect(DEMO_DOCUMENTS[1]!.text).toContain("John Doe");
    expect(DEMO_DOCUMENTS[2]!.text).toContain("Dear John Doe");
  });
});
