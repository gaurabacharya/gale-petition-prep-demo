import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { extractPassport } from "../../src/pipeline/passport";
import { demoPassportText } from "../fixtures/passport";

const run = (text: string, demoMode: boolean) => Effect.runPromise(Effect.either(extractPassport(text, { demoMode })));

describe("extractPassport", () => {
  it("returns every passport field as high-confidence MRZ data", async () => {
    const result = await run(demoPassportText(), true);
    if (result._tag === "Left") throw new Error(result.left.message);
    const byName = Object.fromEntries(result.right.map((f) => [f.name, f]));

    expect(Object.keys(byName)).toEqual([
      "surname",
      "given_names",
      "passport_number",
      "nationality",
      "date_of_birth",
      "sex",
      "expiry_date",
      "issuing_country",
      "mrz_check_digits",
    ]);
    expect(byName.surname.value).toBe("ERIKSSON");
    expect(byName.given_names.value).toBe("ANNA MARIA");
    expect(byName.passport_number.value).toBe("L898902C3");
    expect(byName.nationality.value).toBe("UTO");
    expect(byName.date_of_birth.value).toBe("1994-08-12");
    expect(byName.date_of_birth.quote).toBe("940812");
    expect(byName.sex.value).toBe("F");
    expect(byName.expiry_date.value).toBe("2027-01-15");
    expect(byName.issuing_country.value).toBe("UTO");
    expect(byName.mrz_check_digits.value).toBe("ok");
    for (const f of result.right) {
      expect(f.source).toBe("mrz");
      expect(f.confidence).toBe("high");
    }
  });

  it("names the failing check digits", async () => {
    const result = await run(demoPassportText().replace("L898902C3", "L898903C3"), true);
    if (result._tag === "Left") throw new Error(result.left.message);
    expect(result.right.find((f) => f.name === "mrz_check_digits")?.value).toBe("failed: passport_number, composite");
  });

  it("rejects a non-UTO passport in demo mode", async () => {
    const result = await run(demoPassportText({ country: "USA" }), true);
    expect(result._tag === "Left" && result.left._tag).toBe("DemoModeRejectedError");
  });

  it("accepts a non-UTO passport outside demo mode", async () => {
    const result = await run(demoPassportText({ country: "USA" }), false);
    expect(result._tag).toBe("Right");
  });

  it("returns UnreadableDocumentError when there is no MRZ", async () => {
    const result = await run("Just a scanned page with no machine-readable zone", true);
    expect(result._tag === "Left" && result.left._tag).toBe("UnreadableDocumentError");
  });
});
