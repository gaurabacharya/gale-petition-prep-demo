import { Effect, type Schema } from "effect";
import type { FieldInput } from "../db/fields";
import { LlmClient, type LlmInvalidOutputError, type LlmProviderError } from "../llm/LlmClient";
import { redact, restore } from "../privacy/redact";
import { DEGREE_KEYS, DegreeExtraction, OFFER_LETTER_KEYS, OfferLetterExtraction } from "./schemas";

type Extracted = { readonly value: string; readonly quote: string };

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

/** True when the quote appears in the text, ignoring line wrapping and extra spacing. */
export const quoteAppears = (quote: string, text: string): boolean => {
  const q = normalise(quote);
  return q.length > 0 && normalise(text).includes(q);
};

function buildPrompt(keys: readonly string[], redactedText: string): string {
  return [
    "Extract the following fields from the document below.",
    'For each field return {"value": "...", "quote": "..."}, where quote is the exact text from the document that supports the value.',
    "If a field is not in the document, return empty strings for both value and quote.",
    `Fields: ${keys.join(", ")}`,
    "Return one JSON object with exactly these keys.",
    "",
    "<document>",
    redactedText,
    "</document>",
  ].join("\n");
}

/** Redact, call the model, validate, restore tokens, then grade each value against the original text. */
export function extractWithModel<A extends Record<string, Extracted>, I>(
  schema: Schema.Schema<A, I>,
  keys: readonly (keyof A & string)[],
  text: string,
): Effect.Effect<FieldInput[], LlmProviderError | LlmInvalidOutputError, LlmClient> {
  return Effect.gen(function* () {
    const llm = yield* LlmClient;
    const { text: redacted, vault, counts } = redact(text);
    const result = yield* llm
      .complete({ prompt: buildPrompt(keys, redacted), schema, redactions: counts })
      .pipe(Effect.retry({ times: 1 }));
    return keys.map((key): FieldInput => {
      const value = restore(result[key].value, vault);
      const quote = restore(result[key].quote, vault);
      const found = value.trim() !== "" && quoteAppears(quote, text);
      return { name: key, value, quote, source: "llm", confidence: found ? "high" : "low" };
    });
  });
}

export const extractDegree = (text: string) => extractWithModel(DegreeExtraction, DEGREE_KEYS, text);
export const extractOfferLetter = (text: string) => extractWithModel(OfferLetterExtraction, OFFER_LETTER_KEYS, text);
