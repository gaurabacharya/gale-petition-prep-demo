import type Anthropic from "@anthropic-ai/sdk";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, makeAnthropicProvider } from "../../src/llm/anthropic";

const fakeClient = (create: ReturnType<typeof vi.fn>) => ({ messages: { create } }) as unknown as Anthropic;
const generate = (provider: ReturnType<typeof makeAnthropicProvider>) =>
  Effect.runPromise(Effect.either(provider.generate({ system: "SYS", prompt: "PROMPT" })));

describe("makeAnthropicProvider", () => {
  it("sends the system prompt and prompt and returns the text", async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: '{"a":1}' }] });
    const provider = makeAnthropicProvider({ client: fakeClient(create) });

    const result = await generate(provider);

    expect(result._tag === "Right" && result.right).toBe('{"a":1}');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_ANTHROPIC_MODEL,
        system: "SYS",
        messages: [{ role: "user", content: "PROMPT" }],
      }),
    );
    expect(provider.name).toBe("anthropic");
    expect(provider.model).toBe("claude-sonnet-5-5");
  });

  it("joins multiple text blocks and ignores other block types", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "thinking" }, { type: "text", text: '{"a":' }, { type: "text", text: "1}" }],
    });
    const result = await generate(makeAnthropicProvider({ client: fakeClient(create) }));
    expect(result._tag === "Right" && result.right).toBe('{"a":1}');
  });

  it("gives LlmProviderError when the response has no text", async () => {
    const create = vi.fn().mockResolvedValue({ content: [] });
    const result = await generate(makeAnthropicProvider({ client: fakeClient(create) }));
    expect(result._tag === "Left" && result.left._tag).toBe("LlmProviderError");
  });

  it("gives LlmProviderError when the API call throws, without leaking the cause", async () => {
    const create = vi.fn().mockRejectedValue(new Error("401 for key sk-secret"));
    const result = await generate(makeAnthropicProvider({ client: fakeClient(create) }));
    expect(result._tag === "Left" && result.left._tag).toBe("LlmProviderError");
    expect(result._tag === "Left" && result.left.message).not.toContain("sk-secret");
  });
});
