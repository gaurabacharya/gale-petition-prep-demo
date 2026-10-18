import { Effect, Layer, Schema } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { makeMemoryAuditLog } from "../../src/audit/audit";
import { LlmClient, makeLlmClientLayer, type LlmProvider } from "../../src/llm/LlmClient";
import { makeMockProvider } from "../../src/llm/mock";
import { makeSelfHostedProvider } from "../../src/llm/selfhosted";
import { chatCompletion, startFakeChat, type FakeChat } from "../helpers/fakeChatServer";

const Person = Schema.Struct({ name: Schema.String, salary: Schema.Number });
const servers: FakeChat[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

type Factory = (respond: () => string | object) => Promise<{ provider: LlmProvider; name: string }>;
const text = (out: string | object) => (typeof out === "string" ? out : JSON.stringify(out));

const factories: Record<string, Factory> = {
  mock: async (respond) => ({ provider: makeMockProvider(respond).provider, name: "mock" }),
  selfhosted: async (respond) => {
    const server = await startFakeChat(() => ({ body: chatCompletion(text(respond())) }));
    servers.push(server);
    return { provider: makeSelfHostedProvider({ url: server.url, model: "m" }), name: "selfhosted" };
  },
};

describe.each(Object.keys(factories))("LlmClient contract: %s provider", (kind) => {
  const run = async (respond: () => string | object, redactions = {}) => {
    const { provider, name } = await factories[kind](respond);
    const audit = makeMemoryAuditLog();
    const layer = makeLlmClientLayer(provider).pipe(Layer.provide(audit.layer));
    const result = await Effect.runPromise(
      Effect.flatMap(LlmClient, (c) => c.complete({ prompt: "p", schema: Person, redactions })).pipe(
        Effect.provide(layer),
        Effect.either,
      ),
    );
    return { result, entries: audit.entries, name };
  };

  it("returns schema-valid output", async () => {
    const { result } = await run(() => ({ name: "Anna", salary: 95000 }));
    expect(result._tag === "Right" && result.right).toEqual({ name: "Anna", salary: 95000 });
  });

  it("accepts JSON wrapped in a markdown fence", async () => {
    const { result } = await run(() => '```json\n{"name":"Anna","salary":95000}\n```');
    expect(result._tag).toBe("Right");
  });

  it("gives LlmInvalidOutputError for non-JSON or a schema mismatch, without leaking output", async () => {
    for (const raw of ["not json", { name: "TOPSECRET", salary: "lots" }]) {
      const { result } = await run(() => raw);
      expect(result._tag === "Left" && result.left._tag).toBe("LlmInvalidOutputError");
      expect(result._tag === "Left" && result.left.message).not.toContain("TOPSECRET");
    }
  });

  it("audits provider, model and redaction counts with no values", async () => {
    const { entries, name } = await run(() => ({ name: "Anna Eriksson", salary: 95000 }), { SSN: 2 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "llm_call", detail: { provider: name, redactions: { SSN: 2 } } });
    expect(JSON.stringify(entries)).not.toContain("Anna");
  });
});
