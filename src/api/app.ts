import { Effect, Either, Schema, type Layer } from "effect";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AuditLog } from "../audit/audit";
import type { Db } from "../db/db";
import type { LlmClient } from "../llm/LlmClient";
import { extractAndStore, type ExtractionError } from "../pipeline/extract";
import { caseExists, createCase, getCaseChecks, getCaseDetail, listCases, updateField } from "../repo/cases";
import { checkOutputGate } from "../outputs/gate";
import { buildDataSheet } from "../outputs/dataSheet";
import { generateLetter } from "../outputs/letter";
import { pdfToText } from "./pdf";

export interface AppDeps {
  readonly db: Db;
  readonly layer: Layer.Layer<LlmClient | AuditLog>;
  readonly demoMode: boolean;
  /** Provider and model name recorded with a generated letter. */
  readonly modelName: string;
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
const hasNul = (s: string) => s.includes("\u0000");

const CreateCase = Schema.Struct({ label: Schema.NonEmptyString });
const UploadBody = Schema.Struct({
  kind: Schema.Literal("passport", "degree", "offer_letter"),
  filename: Schema.NonEmptyString,
  text: Schema.String,
});
const PatchField = Schema.Struct({
  value: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Literal("pending", "approved")),
});

type Upload = Schema.Schema.Type<typeof UploadBody>;
type UploadResult =
  | { readonly ok: true; readonly upload: Upload }
  | { readonly ok: false; readonly status: 400 | 413 | 422; readonly message: string };

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const KINDS = ["passport", "degree", "offer_letter"] as const;

const isPdfBytes = (b: Uint8Array) =>
  b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;

function checkText(text: string, filename: string, binaryStatus: 400 | 422): UploadResult | undefined {
  if (hasNul(filename)) return { ok: false, status: 400, message: "The filename is not valid" };
  if (text.trim() === "") return { ok: false, status: binaryStatus, message: "The document has no text" };
  if (hasNul(text)) return { ok: false, status: binaryStatus, message: "The document contains binary data" };
  if (text.length > MAX_TEXT_CHARS) return { ok: false, status: 413, message: "The document is too large" };
  return undefined;
}

async function readMultipart(c: Context): Promise<UploadResult> {
  const form = await c.req.parseBody().catch(() => undefined);
  const file = form?.file;
  const kind = form?.kind;
  if (!(file instanceof File) || typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) {
    return { ok: false, status: 400, message: "kind and file are required" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = isPdfBytes(bytes) || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  let text: string;
  try {
    text = isPdf ? await pdfToText(bytes) : new TextDecoder("utf-8").decode(bytes);
  } catch {
    return { ok: false, status: 422, message: "Could not read the PDF" };
  }
  const problem = checkText(text, file.name, 422);
  if (problem) return problem;
  return { ok: true, upload: { kind: kind as Upload["kind"], filename: file.name, text } };
}

async function readUpload(c: Context): Promise<UploadResult> {
  if ((c.req.header("content-type") ?? "").includes("multipart/form-data")) return readMultipart(c);
  const parsed = Schema.decodeUnknownEither(UploadBody)(await readJson(c));
  if (Either.isLeft(parsed)) {
    return { ok: false, status: 400, message: "kind, filename and text are required" };
  }
  const problem = checkText(parsed.right.text, parsed.right.filename, 400);
  if (problem) return problem;
  return { ok: true, upload: parsed.right };
}

function extractionErrorResponse(c: Context, e: ExtractionError) {
  switch (e._tag) {
    case "UnreadableDocumentError":
      return c.json({ error: e.message }, 422);
    case "DemoModeRejectedError":
      return c.json({ error: e.message }, 403);
    case "LlmProviderError":
    case "LlmInvalidOutputError":
      return c.json({ error: e.message }, 502);
  }
}

export function makeApp(deps: AppDeps): Hono {
  const app = new Hono();
  const badRequest = (c: Context, message: string) => c.json({ error: message }, 400);
  const notFound = (c: Context) => c.json({ error: "Not found" }, 404);

  app.post("/cases", async (c) => {
    const parsed = Schema.decodeUnknownEither(CreateCase)(await readJson(c));
    if (Either.isLeft(parsed)) return badRequest(c, "label is required");
    return c.json(await createCase(deps.db, parsed.right.label), 201);
  });

  app.get("/status", (c) => c.json({ demoMode: deps.demoMode, model: deps.modelName }));

  app.get("/cases", async (c) => c.json(await listCases(deps.db)));

  app.get("/cases/:id", async (c) => {
    const detail = await getCaseDetail(deps.db, c.req.param("id"));
    return detail ? c.json(detail) : notFound(c);
  });

  app.get("/cases/:id/checks", async (c) => {
    const result = await getCaseChecks(deps.db, c.req.param("id"));
    return result ? c.json(result) : notFound(c);
  });

  app.post("/cases/:id/data-sheet", async (c) => {
    const gate = await checkOutputGate(deps.db, c.req.param("id"));
    if (!gate) return notFound(c);
    if ("blocked" in gate) return c.json({ error: gate.blocked.message }, 409);
    const { detail } = gate;
    const value = (kind: string, name: string) => detail.fields.find((f) => f.docKind === kind && f.name === name)?.value;
    const beneficiary =
      [value("passport", "given_names"), value("passport", "surname")].filter(Boolean).join(" ") ||
      value("offer_letter", "name") ||
      detail.label;
    const bytes = await buildDataSheet({ caseLabel: detail.label, beneficiary, fields: detail.fields });
    await Effect.runPromise(
      Effect.flatMap(AuditLog, (audit) => audit.record("output_generated", { counts: { data_sheet: 1 } })).pipe(
        Effect.provide(deps.layer),
      ),
    );
    const filename = `petition-data-${detail.label.replace(/[^A-Za-z0-9_-]+/g, "-") || "case"}.pdf`;
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}"` },
    });
  });

  app.post("/cases/:id/letter", async (c) => {
    const caseId = c.req.param("id");
    const gate = await checkOutputGate(deps.db, caseId);
    if (!gate) return notFound(c);
    if ("blocked" in gate) return c.json({ error: gate.blocked.message }, 409);
    const result = await Effect.runPromise(
      generateLetter(deps.db, caseId, gate.detail.fields, deps.modelName).pipe(Effect.provide(deps.layer), Effect.either),
    );
    if (Either.isLeft(result)) return c.json({ error: result.left.message }, 502);
    return c.json(result.right);
  });

  const uploadLimit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "The upload is too large" }, 413),
  });

  app.post("/cases/:id/documents", uploadLimit, async (c) => {
    const caseId = c.req.param("id");
    if (!(await caseExists(deps.db, caseId))) return notFound(c);
    const read = await readUpload(c);
    if (!read.ok) return c.json({ error: read.message }, read.status);
    const result = await Effect.runPromise(
      extractAndStore(deps.db, { demoMode: deps.demoMode }, { caseId, ...read.upload }).pipe(
        Effect.provide(deps.layer),
        Effect.either,
      ),
    );
    return Either.isLeft(result) ? extractionErrorResponse(c, result.left) : c.json(result.right);
  });

  app.patch("/fields/:id", async (c) => {
    const parsed = Schema.decodeUnknownEither(PatchField)(await readJson(c));
    if (Either.isLeft(parsed) || (parsed.right.value === undefined && parsed.right.status === undefined)) {
      return badRequest(c, "Provide a value, a status of pending or approved, or both");
    }
    if (parsed.right.value !== undefined && hasNul(parsed.right.value)) {
      return badRequest(c, "The value contains binary data");
    }
    const updated = await updateField(deps.db, c.req.param("id"), parsed.right);
    return updated ? c.json(updated) : notFound(c);
  });

  app.onError((_err, c) => c.json({ error: "Internal error" }, 500));
  return app;
}
