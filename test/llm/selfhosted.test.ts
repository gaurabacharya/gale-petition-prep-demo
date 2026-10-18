import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { makeSelfHostedProvider } from "../../src/llm/selfhosted";
import { chatCompletion, startFakeChat, type FakeChat } from "../helpers/fakeChatServer";

let server: FakeChat | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const generate = (url: string) =>
  Effect.runPromise(Effect.either(makeSelfHostedProvider({ url, model: "qwen-test" }).generate({ system: "SYS", prompt: "PROMPT" })));

describe("makeSelfHostedProvider", () => {
  it("posts system and user messages to the chat completions endpoint and returns the content", async () => {
    server = await startFakeChat(() => ({ body: chatCompletion('{"a":1}') }));
    const result = await generate(server.url);
    expect(result._tag === "Right" && result.right).toBe('{"a":1}');
    expect(server.requests[0].path).toBe("/v1/chat/completions");
    expect(server.requests[0].body).toMatchObject({
      model: "qwen-test",
      messages: [
        { role: "system", content: "SYS" },
        { role: "user", content: "PROMPT" },
      ],
    });
  });

  it("has the provider name selfhosted and the configured model", () => {
    const p = makeSelfHostedProvider({ url: "http://x", model: "qwen-test" });
    expect([p.name, p.model]).toEqual(["selfhosted", "qwen-test"]);
  });

  it("gives LlmProviderError for an error status, a malformed body and empty content, without leaking them", async () => {
    for (const reply of [
      { status: 500, body: "TOPSECRET failure" },
      { body: "not json TOPSECRET" },
      { body: chatCompletion("") },
    ]) {
      server = await startFakeChat(() => reply);
      const result = await generate(server.url);
      expect(result._tag === "Left" && result.left._tag).toBe("LlmProviderError");
      const message = result._tag === "Left" ? result.left.message : "";
      expect(message).not.toContain("TOPSECRET");
      expect(message).not.toContain("127.0.0.1");
      await server.close();
      server = undefined;
    }
  });

  it("gives LlmProviderError when the server is unreachable", async () => {
    const result = await generate("http://127.0.0.1:1");
    expect(result._tag === "Left" && result.left._tag).toBe("LlmProviderError");
  });
});
