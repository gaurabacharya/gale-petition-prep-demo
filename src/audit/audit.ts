import { Context, Effect, Layer } from "effect";
import type { Db } from "../db/db";
import type { RedactionCounts } from "../privacy/redact";

/** Closed on purpose: counts, provider and model only. Never field values. */
export interface AuditDetail {
  readonly provider?: string;
  readonly model?: string;
  readonly redactions?: RedactionCounts;
  readonly counts?: Readonly<Record<string, number>>;
}

export interface AuditEntry {
  readonly action: string;
  readonly detail: AuditDetail;
}

export class AuditLog extends Context.Tag("AuditLog")<
  AuditLog,
  { readonly record: (action: string, detail: AuditDetail) => Effect.Effect<void> }
>() {}

export const AuditLogPg = (db: Db): Layer.Layer<AuditLog> =>
  Layer.succeed(AuditLog, {
    record: (action, detail) =>
      Effect.tryPromise(() =>
        db.query("insert into audit_log (action, detail) values ($1, $2::jsonb)", [action, JSON.stringify(detail)]),
      ).pipe(Effect.asVoid, Effect.orDie),
  });

export function makeMemoryAuditLog(): { layer: Layer.Layer<AuditLog>; entries: AuditEntry[] } {
  const entries: AuditEntry[] = [];
  const layer = Layer.succeed(AuditLog, {
    record: (action, detail) =>
      Effect.sync(() => {
        entries.push({ action, detail });
      }),
  });
  return { layer, entries };
}
