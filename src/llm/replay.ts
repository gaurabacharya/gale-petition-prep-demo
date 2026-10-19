import { Effect } from "effect";
import { RECORDED_DEGREE, RECORDED_LETTER, RECORDED_OFFER_LETTER } from "../demo/recorded";
import { LlmProviderError, type LlmProvider } from "./LlmClient";

const JOHN_DOE_ONLY =
  "The replay provider only has recorded answers for the John Doe demo documents. Set LLM_PROVIDER=anthropic to process other documents.";

/**
 * Plays back responses Claude wrote earlier for the John Doe demo documents, so a deployed demo works
 * with no API key. The rest of the pipeline (MRZ parsing, redaction, quote grading, checks, gate) runs for real.
 */
export function makeReplayProvider(): LlmProvider {
  return {
    name: "replay",
    model: "recorded-claude-sonnet-5-5",
    generate: ({ prompt }) =>
      Effect.suspend(() => {
        if (prompt.startsWith("Draft a support letter")) {
          // The attorney may approve the full name from the questionnaire, so accept either spelling
          // and put the approved name into the recorded letter.
          const name = /Beneficiary name: (John (?:Michael )?Doe)\n/i.exec(prompt)?.[1];
          return name
            ? Effect.succeed(JSON.stringify({ body: RECORDED_LETTER.replaceAll("John Doe", name) }))
            : Effect.fail(new LlmProviderError({ message: JOHN_DOE_ONLY }));
        }
        if (!prompt.includes("John Doe")) return Effect.fail(new LlmProviderError({ message: JOHN_DOE_ONLY }));
        if (prompt.includes("field_of_study")) return Effect.succeed(JSON.stringify(RECORDED_DEGREE));
        if (prompt.includes("annual_salary")) return Effect.succeed(JSON.stringify(RECORDED_OFFER_LETTER));
        return Effect.fail(new LlmProviderError({ message: JOHN_DOE_ONLY }));
      }),
  };
}
