import { describe, expect, it } from "vitest";
import { countDiscrepancies, runChecks, type Check } from "../../src/checks/checks";
import type { FieldRow } from "../../src/repo/cases";
import type { DocKind } from "../../src/db/fields";

let n = 0;
const f = (
  docKind: DocKind,
  name: string,
  value: string,
  o: Partial<Pick<FieldRow, "confidence" | "source">> = {},
): FieldRow => ({
  id: `id-${n++}`,
  docKind,
  name,
  value,
  quote: value,
  source: o.source ?? "llm",
  confidence: o.confidence ?? "high",
  status: "pending",
});

const docs = [{ kind: "passport" as const }, { kind: "degree" as const }, { kind: "offer_letter" as const }];

const baseline = (over: Record<string, string> = {}): FieldRow[] => {
  const v = (k: string, d: string) => over[k] ?? d;
  return [
    f("passport", "given_names", "ANNA MARIA", { source: "mrz" }),
    f("passport", "surname", "ERIKSSON", { source: "mrz" }),
    f("passport", "expiry_date", v("expiry", "2027-01-15"), { source: "mrz" }),
    f("passport", "mrz_check_digits", v("mrz", "ok"), { source: "mrz" }),
    f("degree", "name", v("degreeName", "Anna Eriksson")),
    f("offer_letter", "name", "Anna Eriksson"),
    f("offer_letter", "annual_salary", v("salary", "$95,000")),
    f("offer_letter", "start_date", v("start", "October 1, 2026")),
  ];
};

const find = (cs: Check[], id: string) => cs.find((c) => c.id === id);

describe("runChecks", () => {
  it("warns on missing middle name and near-expiry passport for the baseline", () => {
    const cs = runChecks(baseline(), docs);
    expect(find(cs, "name_mismatch_degree")?.level).toBe("warning");
    expect(find(cs, "name_mismatch_offer_letter")?.level).toBe("warning");
    expect(find(cs, "passport_validity")?.level).toBe("warning");
  });

  it("flags a different surname as a problem", () => {
    const cs = runChecks(baseline({ degreeName: "Anna Larsson" }), docs);
    expect(find(cs, "name_mismatch_degree")?.level).toBe("problem");
  });

  it("flags expiry before the start date as a problem and a distant expiry as clean", () => {
    expect(find(runChecks(baseline({ expiry: "2026-09-01" }), docs), "passport_validity")?.level).toBe("problem");
    expect(find(runChecks(baseline({ expiry: "2028-06-01" }), docs), "passport_validity")).toBeUndefined();
  });

  it("flags failed MRZ digits", () => {
    expect(find(runChecks(baseline({ mrz: "failed: expiry_date" }), docs), "mrz_check_digits")?.level).toBe("problem");
    expect(find(runChecks(baseline(), docs), "mrz_check_digits")).toBeUndefined();
  });

  it("flags an unusable salary", () => {
    expect(find(runChecks(baseline({ salary: "negotiable" }), docs), "salary")?.level).toBe("problem");
    expect(find(runChecks(baseline(), docs), "salary")).toBeUndefined();
  });

  it("flags a missing document", () => {
    const cs = runChecks(baseline(), docs.filter((d) => d.kind !== "degree"));
    expect(find(cs, "missing_document_degree")?.level).toBe("problem");
  });

  it("lists low-confidence fields once and skips name mismatch for an empty name", () => {
    const fields = baseline().map((x) =>
      x.docKind === "degree" && x.name === "name" ? { ...x, value: "", confidence: "low" as const } : x,
    );
    const cs = runChecks(fields, docs);
    const low = cs.filter((c) => c.id === "low_confidence");
    expect(low).toHaveLength(1);
    expect(low[0].level).toBe("warning");
    expect(low[0].fieldRefs).toContainEqual({ docKind: "degree", name: "name" });
    expect(find(cs, "name_mismatch_degree")).toBeUndefined();
  });

  it("does not throw on an unparseable start date", () => {
    const cs = runChecks(baseline({ start: "TBD" }), docs);
    expect(find(cs, "passport_validity")).toBeUndefined();
  });

  it("always includes the attorney items", () => {
    const cs = runChecks(baseline(), docs);
    expect(find(cs, "specialty_occupation")?.level).toBe("for_attorney");
    expect(find(cs, "prevailing_wage")?.level).toBe("for_attorney");
  });
});

describe("countDiscrepancies", () => {
  it("counts problems and warnings only", () => {
    const mk = (level: Check["level"]): Check => ({ id: level, level, message: "", fieldRefs: [] });
    expect(countDiscrepancies([mk("problem"), mk("warning"), mk("for_attorney")])).toBe(2);
  });
});
