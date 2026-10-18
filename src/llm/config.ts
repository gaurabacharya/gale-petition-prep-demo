import Anthropic from "@anthropic-ai/sdk";
import { Data, Effect, Layer } from "effect";
import type { AuditLog } from "../audit/audit";
import { makeAnthropicProvider } from "./anthropic";
import { LlmClient, makeLlmClientLayer, type LlmProvider } from "./LlmClient";
import { makeMockProvider } from "./mock";

export class LlmConfigError extends Data.TaggedError("LlmConfigError")<{
  readonly message: string;
}> {}

type Env = Record<string, string | undefined>;

export function llmProviderFromEnv(env: Env): Effect.Effect<LlmProvider, LlmConfigError> {
  const choice = env.LLM_PROVIDER ?? "anthropic";
  switch (choice) {
    case "anthropic": {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return Effect.fail(new LlmConfigError({ message: "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic" }));
      }
      return Effect.succeed(makeAnthropicProvider({ client: new Anthropic({ apiKey }), model: env.ANTHROPIC_MODEL }));
    }
    case "mock":
      return Effect.succeed(makeMockProvider().provider);
    default:
      return Effect.fail(new LlmConfigError({ message: `Unknown LLM_PROVIDER "${choice}". Expected anthropic or mock.` }));
  }
}

export const llmClientFromEnv = (env: Env): Layer.Layer<LlmClient, LlmConfigError, AuditLog> =>
  Layer.unwrapEffect(Effect.map(llmProviderFromEnv(env), makeLlmClientLayer));
