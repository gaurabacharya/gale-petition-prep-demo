import { describe, expect, it } from "vitest";
import type { Check, FieldRow } from "../../web/src/api";
import { sortFacts } from "../../web/src/lib/sortFacts";

const f = (name: string): FieldRow => ({
  id: name,
  docKind: "offer_letter",
  name,
  value: "",
  quote: "",
  source: "llm",
  confidence: "high",
  status: "pending",
});
const c = (level: Check["level"], name: string): Check => ({
  id: `${level}-${name}`,
  level,
  message: "",
  fieldRefs: [{ docKind: "offer_letter", name }],
});

describe("sortFacts", () => {
  it("puts problems first, then warnings, then the rest in original order", () => {
    const sorted = sortFacts([f("a"), f("b"), f("c"), f("d")], [c("warning", "c"), c("problem", "d"), c("for_attorney", "a")]);
    expect(sorted.map((x) => x.name)).toEqual(["d", "c", "a", "b"]);
  });
});
