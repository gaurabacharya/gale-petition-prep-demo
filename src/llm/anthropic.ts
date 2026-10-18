import type Anthropic from "@anthropic-ai/sdk";
import { Effect } from "effect";
import { LlmProviderError, type LlmProvider } from "./LlmClient";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

export function makeAnthropicProvider(opts: {
  client: Pick<Anthropic, "messages">;
  model?: string;
  maxTokens?: number;
}): LlmProvider {
  const model = opts.model ?? DEFAULT_ANTHROPIC_MODEL;
  return {
    name: "anthropic",
    model,
    generate: ({ system, prompt }) =>
      Effect.tryPromise({
        try: async () => {
          const res = await opts.client.messages.create({
            model,
            max_tokens: opts.maxTokens ?? 2048,
            system,
            messages: [{ role: "user", content: prompt }],
          });
          const text = res.content.map((block) => (block.type === "text" ? block.text : "")).join("");
          if (!text) throw new Error("empty response");
          return text;
        },
        // Deliberately drops the underlying error: it can echo request details.
        catch: () => new LlmProviderError({ message: "Anthropic request failed" }),
      }),
  };
}
