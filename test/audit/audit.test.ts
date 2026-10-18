import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditLog, AuditLogPg, makeMemoryAuditLog } from "../../src/audit/audit";
import type { Db } from "../../src/db/db";
import { makeTestDb } from "../helpers/testDb";

const record = Effect.gen(function* () {
  const audit = yield* AuditLog;
  yield* audit.record("llm_call", { provider: "mock", model: "mock", redactions: { SSN: 2 } });
});

describe("AuditLogPg", () => {
  let db: Db;
  beforeAll(async () => {
    db = await makeTestDb();
  });
  afterAll(() => db.close());

  it("writes an audit_log row", async () => {
    await Effect.runPromise(record.pipe(Effect.provide(AuditLogPg(db))));
    const { rows } = await db.query<{ action: string; detail: unknown }>("select action, detail from audit_log");
    expect(rows).toEqual([{ action: "llm_call", detail: { provider: "mock", model: "mock", redactions: { SSN: 2 } } }]);
  });
});

describe("makeMemoryAuditLog", () => {
  it("collects entries in order", async () => {
    const { layer, entries } = makeMemoryAuditLog();
    await Effect.runPromise(record.pipe(Effect.provide(layer)));
    expect(entries).toEqual([{ action: "llm_call", detail: { provider: "mock", model: "mock", redactions: { SSN: 2 } } }]);
  });
});
