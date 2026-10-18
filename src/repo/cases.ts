import type { Db } from "../db/db";
import {
  replaceFields,
  type Confidence,
  type DocKind,
  type FieldInput,
  type FieldSource,
} from "../db/fields";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string): boolean => UUID.test(id);

export interface FieldRow {
  readonly id: string;
  readonly docKind: DocKind;
  readonly name: string;
  readonly value: string;
  readonly quote: string;
  readonly source: FieldSource;
  readonly confidence: Confidence;
  readonly status: "pending" | "approved";
}

export interface CaseSummary {
  readonly id: string;
  readonly label: string;
  readonly beneficiary: string | null;
  readonly employer: string | null;
  readonly status: "empty" | "needs_review" | "ready";
  readonly documents: number;
  readonly lowConfidence: number;
}

export interface CaseDetail {
  readonly id: string;
  readonly label: string;
  readonly documents: readonly { kind: DocKind; filename: string }[];
  readonly fields: readonly FieldRow[];
}

export interface SaveExtractionInput {
  readonly caseId: string;
  readonly kind: DocKind;
  readonly filename: string;
  readonly rawText: string;
  readonly fields: readonly FieldInput[];
}

interface FieldDbRow {
  id: string;
  doc_kind: DocKind;
  name: string;
  value: string;
  quote: string;
  source: FieldSource;
  confidence: Confidence;
  status: "pending" | "approved";
}

const FIELD_COLUMNS = "id, doc_kind, name, value, quote, source, confidence, status";

const toFieldRow = (r: FieldDbRow): FieldRow => ({
  id: r.id,
  docKind: r.doc_kind,
  name: r.name,
  value: r.value,
  quote: r.quote,
  source: r.source,
  confidence: r.confidence,
  status: r.status,
});

export async function createCase(db: Db, label: string): Promise<{ id: string; label: string }> {
  const { rows } = await db.query<{ id: string; label: string }>(
    "insert into cases (label) values ($1) returning id, label",
    [label],
  );
  return rows[0];
}

export async function caseExists(db: Db, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return (await db.query("select 1 from cases where id = $1", [id])).rows.length > 0;
}

/** Upserts the document and replaces its fields, all or nothing. */
export async function saveExtraction(db: Db, input: SaveExtractionInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into documents (case_id, kind, filename, raw_text) values ($1, $2, $3, $4)
       on conflict (case_id, kind) do update set filename = excluded.filename, raw_text = excluded.raw_text`,
      [input.caseId, input.kind, input.filename, input.rawText],
    );
    await replaceFields(tx, input.caseId, input.kind, input.fields);
  });
}

const fieldValue = (docKind: string, name: string) =>
  `(select value from fields f where f.case_id = c.id and f.doc_kind = '${docKind}' and f.name = '${name}')`;

const LIST_SQL = `
  select c.id, c.label,
    (select count(*) from documents d where d.case_id = c.id)::int as documents,
    (select count(*) from fields f where f.case_id = c.id)::int as total_fields,
    (select count(*) from fields f where f.case_id = c.id and f.status = 'pending')::int as pending_fields,
    (select count(*) from fields f where f.case_id = c.id and f.confidence = 'low')::int as low_confidence,
    ${fieldValue("passport", "given_names")} as given_names,
    ${fieldValue("passport", "surname")} as surname,
    ${fieldValue("offer_letter", "name")} as offer_name,
    ${fieldValue("offer_letter", "employer")} as employer
  from cases c
  order by c.created_at desc, c.id`;

interface ListRow {
  id: string;
  label: string;
  documents: number;
  total_fields: number;
  pending_fields: number;
  low_confidence: number;
  given_names: string | null;
  surname: string | null;
  offer_name: string | null;
  employer: string | null;
}

export async function listCases(db: Db): Promise<CaseSummary[]> {
  const { rows } = await db.query<ListRow>(LIST_SQL);
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    beneficiary: [r.given_names, r.surname].filter(Boolean).join(" ") || r.offer_name || null,
    employer: r.employer,
    status:
      r.total_fields === 0 ? "empty" : r.pending_fields > 0 || r.documents < 3 ? "needs_review" : "ready",
    documents: r.documents,
    lowConfidence: r.low_confidence,
  }));
}

export async function getCaseDetail(db: Db, id: string): Promise<CaseDetail | undefined> {
  if (!isUuid(id)) return undefined;
  const found = await db.query<{ id: string; label: string }>("select id, label from cases where id = $1", [id]);
  if (found.rows.length === 0) return undefined;
  const documents = await db.query<{ kind: DocKind; filename: string }>(
    "select kind, filename from documents where case_id = $1 order by kind",
    [id],
  );
  const fields = await db.query<FieldDbRow>(
    `select ${FIELD_COLUMNS} from fields where case_id = $1 order by doc_kind, name`,
    [id],
  );
  return { ...found.rows[0], documents: documents.rows, fields: fields.rows.map(toFieldRow) };
}

/** An edit marks the field attorney-sourced and pending, unless the same request also sets a status. */
export async function updateField(
  db: Db,
  id: string,
  patch: { readonly value?: string; readonly status?: "pending" | "approved" },
): Promise<FieldRow | undefined> {
  if (!isUuid(id)) return undefined;
  const { rows } = await db.query<FieldDbRow>(
    `update fields set
       value = coalesce($2::text, value),
       source = case when $2::text is not null then 'attorney' else source end,
       status = coalesce($3::text, case when $2::text is not null then 'pending' else status end)
     where id = $1
     returning ${FIELD_COLUMNS}`,
    [id, patch.value ?? null, patch.status ?? null],
  );
  return rows[0] ? toFieldRow(rows[0]) : undefined;
}
