import { Effect } from "effect";
import { LlmProviderError, type LlmProvider } from "./LlmClient";

export const DEFAULT_SELFHOSTED_MODEL = "Qwen/Qwen2.5-72B-Instruct";

/** An OpenAI-compatible chat endpoint, such as the one vLLM serves on a server the firm controls. */
export function makeSelfHostedProvider(opts: { url: string; model?: string; fetch?: typeof fetch }): LlmProvider {
  const model = opts.model ?? DEFAULT_SELFHOSTED_MODEL;
  const doFetch = opts.fetch ?? fetch;
  const endpoint = `${opts.url.replace(/\/+$/, "")}/v1/chat/completions`;
  return {
    name: "selfhosted",
    model,
    generate: ({ system, prompt }) =>
      Effect.tryPromise({
        try: async () => {
          const res = await doFetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model,
              temperature: 0,
              messages: [
                { role: "system", content: system },
                { role: "user", content: prompt },
              ],
            }),
          });
          if (!res.ok) throw new Error("bad status");
          const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const content = json.choices?.[0]?.message?.content;
          if (!content) throw new Error("empty response");
          return content;
        },
        // Deliberately drops the underlying error: it can echo the URL or response body.
        catch: () => new LlmProviderError({ message: "Self-hosted model request failed" }),
      }),
  };
}
