import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { llmProviderFromEnv } from "../../src/llm/config";

const resolve = (env: Record<string, string | undefined>) => Effect.runPromise(Effect.either(llmProviderFromEnv(env)));

describe("llmProviderFromEnv", () => {
  it("defaults to anthropic and needs an API key", async () => {
    const result = await resolve({});
    expect(result._tag === "Left" && result.left._tag).toBe("LlmConfigError");
    expect(result._tag === "Left" && result.left.message).toContain("ANTHROPIC_API_KEY");
  });

  it("builds the Anthropic provider with the default model", async () => {
    const result = await resolve({ ANTHROPIC_API_KEY: "test-key" });
    expect(result._tag === "Right" && [result.right.name, result.right.model]).toEqual(["anthropic", "claude-sonnet-5-5"]);
  });

  it("lets ANTHROPIC_MODEL override the model", async () => {
    const result = await resolve({ ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-haiku-5-5" });
    expect(result._tag === "Right" && result.right.model).toBe("claude-haiku-5-5");
  });

  it("builds the mock provider without a key", async () => {
    const result = await resolve({ LLM_PROVIDER: "mock" });
    expect(result._tag === "Right" && result.right.name).toBe("mock");
  });

  it("needs LLM_SERVER_URL for the selfhosted provider", async () => {
    const result = await resolve({ LLM_PROVIDER: "selfhosted" });
    expect(result._tag === "Left" && result.left.message).toContain("LLM_SERVER_URL");
  });

  it("builds the selfhosted provider from LLM_SERVER_URL and LLM_MODEL", async () => {
    const result = await resolve({ LLM_PROVIDER: "selfhosted", LLM_SERVER_URL: "http://gpu:8000", LLM_MODEL: "qwen-x" });
    expect(result._tag === "Right" && [result.right.name, result.right.model]).toEqual(["selfhosted", "qwen-x"]);
  });

  it("rejects an unknown provider and lists the valid ones", async () => {
    const result = await resolve({ LLM_PROVIDER: "gpt" });
    expect(result._tag === "Left" && result.left.message).toContain("anthropic, selfhosted, replay or mock");
  });
});
