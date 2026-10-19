import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { DEGREE_TEXT, OFFER_LETTER_TEXT } from "../../src/demo/sampleDocs";
import { llmProviderFromEnv } from "../../src/llm/config";
import { makeReplayProvider } from "../../src/llm/replay";
import { extractDegree, extractOfferLetter } from "../../src/pipeline/model";
import { buildLetterFacts, buildLetterPrompt } from "../../src/outputs/letter";
import { makeLlmClientLayer } from "../../src/llm/LlmClient";
import { makeMemoryAuditLog } from "../../src/audit/audit";
import { Layer } from "effect";

const layer = () => {
  const audit = makeMemoryAuditLog();
  return Layer.merge(audit.layer, makeLlmClientLayer(makeReplayProvider()).pipe(Layer.provide(audit.layer)));
};

describe("replay provider", () => {
  it("is selectable with LLM_PROVIDER=replay", async () => {
    const p = await Effect.runPromise(llmProviderFromEnv({ LLM_PROVIDER: "replay" }));
    expect(p.name).toBe("replay");
  });

  it("extracts the John Doe degree and offer letter with every quote found in the document", async () => {
    for (const [extract, text] of [[extractDegree, DEGREE_TEXT], [extractOfferLetter, OFFER_LETTER_TEXT]] as const) {
      const fields = await Effect.runPromise(extract(text).pipe(Effect.provide(layer())));
      expect(fields.length).toBeGreaterThan(0);
      expect(fields.every((f) => f.confidence === "high")).toBe(true);
    }
  });

  it("refuses documents it has no recording for", async () => {
    const r = await Effect.runPromise(extractDegree("Jane Roe\nBachelor of Arts in Art").pipe(Effect.provide(layer()), Effect.either));
    expect(r._tag).toBe("Left");
  });

  it("returns the recorded letter for John Doe's facts and refuses others", async () => {
    const generate = (prompt: string) => Effect.runPromise(makeReplayProvider().generate({ system: "", prompt }).pipe(Effect.either));
    const ok = buildLetterPrompt({ ...buildLetterFacts([]), beneficiary_name: "John Doe" });
    const good = await generate(ok);
    expect(good._tag === "Right" && good.right).toContain("Software Engineer");
    expect((await generate(ok.replace("John Doe", "Jane Roe")))._tag).toBe("Left");
  });

  it("returns the letter with the full name when the attorney approved John Michael Doe", async () => {
    const generate = (prompt: string) => Effect.runPromise(makeReplayProvider().generate({ system: "", prompt }).pipe(Effect.either));
    const full = await generate(buildLetterPrompt({ ...buildLetterFacts([]), beneficiary_name: "John Michael Doe" }));
    expect(full._tag === "Right" && full.right).toContain("employ John Michael Doe");
    expect(full._tag === "Right" && full.right).not.toMatch(/John Doe/);
  });
});
