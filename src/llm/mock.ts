import { Effect } from "effect";
import type { LlmProvider } from "./LlmClient";

export interface MockCall {
  readonly system: string;
  readonly prompt: string;
}

/** A provider with no network. `respond` returns a raw string or an object that is JSON-encoded. */
export function makeMockProvider(respond: (call: MockCall) => string | object = () => ({})): {
  provider: LlmProvider;
  calls: MockCall[];
} {
  const calls: MockCall[] = [];
  const provider: LlmProvider = {
    name: "mock",
    model: "mock",
    generate: (call) =>
      Effect.sync(() => {
        calls.push(call);
        const out = respond(call);
        return typeof out === "string" ? out : JSON.stringify(out);
      }),
  };
  return { provider, calls };
}
