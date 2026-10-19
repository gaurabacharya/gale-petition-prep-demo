import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  getCase,
  generateDataSheet,
  generateLetter,
  getChecks,
  patchField,
  uploadDocument,
  type CaseDetail,
  type CaseSummary,
  type Check,
  type DocKind,
} from "../api";
import { Button } from "../components/Button";
import { AddDocumentsDialog } from "../components/AddDocumentsDialog";
import { ChecksCard } from "../components/ChecksCard";
import { FactRow } from "../components/FactRow";
import { LetterPanel } from "../components/LetterPanel";
import { StatusPill } from "../components/StatusPill";
import { downloadBlob } from "../lib/download";
import { fieldLevel, sortFacts } from "../lib/sortFacts";

const KINDS: DocKind[] = ["passport", "degree", "offer_letter"];

function statusOf(detail: CaseDetail, checks: readonly Check[]): CaseSummary["status"] {
  if (detail.fields.length === 0) return "empty";
  if (detail.fields.every((f) => f.status === "approved") && detail.documents.length >= 3) return "ready";
  return checks.some((c) => c.level === "problem") ? "discrepancy" : "needs_review";
}

function titleOf(detail: CaseDetail): string {
  const v = (k: DocKind, n: string) => detail.fields.find((f) => f.docKind === k && f.name === n)?.value;
  return [v("passport", "given_names"), v("passport", "surname")].filter(Boolean).join(" ") || v("offer_letter", "name") || detail.label;
}

export function CaseReview() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<CaseDetail | undefined>();
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(params.get("new") === "1");
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const [letter, setLetter] = useState<{ body: string; model: string } | undefined>();

  // One refetch path for every change and upload, so approvals and checks never go stale.
  const refresh = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([getCase(id), getChecks(id)]);
      setDetail(d);
      setChecks(c.checks);
      setError(undefined);
      return d;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const change = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    await refresh();
  };

  // Upload for the walkthrough, then fade in just the facts that arrived, one after another.
  const uploadAndReveal = async (kind: DocKind, file: File) => {
    const before = new Set((detail?.fields ?? []).map((f) => f.id));
    await uploadDocument(id, kind, file);
    const d = await refresh();
    const arrived = (d?.fields ?? []).filter((f) => !before.has(f.id));
    setFresh(Object.fromEntries(arrived.map((f, i) => [f.id, i * 120])));
  };

  const output = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!detail) return <p className="text-sm text-slate-500">{error ?? "Loading…"}</p>;

  const status = statusOf(detail, checks);
  const allApproved = detail.fields.length > 0 && detail.fields.every((f) => f.status === "approved");
  const facts = sortFacts(detail.fields, checks);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl font-semibold text-slate-900">{titleOf(detail)}</h1>
            <StatusPill status={status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Review each fact against its source, then accept it. Questionnaire answers are demo data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button disabled={!allApproved} onClick={() => void output(async () => setLetter(await generateLetter(id)))}>
            Draft support letter
          </Button>
          <Button variant="primary" disabled={!allApproved} onClick={() => void output(async () => downloadBlob(await generateDataSheet(id), "petition-data.pdf"))}>
            Generate petition data
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {status === "ready" && (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Every fact is approved. This case is ready to file.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Button onClick={() => setAdding(true)}>Add documents</Button>
        {KINDS.map((kind) => (
          <label key={kind} className="text-sm text-slate-600">
            <span className="mr-2 font-medium capitalize">
              {kind.replace("_", " ")}
              {detail.documents.some((d) => d.kind === kind) ? " ✓" : ""}
            </span>
            <input
              type="file"
              aria-label={`Upload ${kind}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void change(() => uploadDocument(id, kind, file));
              }}
            />
          </label>
        ))}
      </div>

      {adding && (
        <AddDocumentsDialog
          uploaded={detail.documents.map((d) => d.kind)}
          onUpload={uploadAndReveal}
          onClose={() => setAdding(false)}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                {["Field", "Questionnaire answer", "Document value", "Source", "Status"].map((h, i) => (
                  <th key={h} className={`px-3 py-3 font-semibold ${["w-[16%]", "w-[24%]", "w-[34%]", "w-[8%]", "w-[18%]"][i]}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {facts.map((f) => (
                <FactRow
                  key={f.id}
                  field={f}
                  revealDelay={fresh[f.id]}
                  answer={detail.answers[`${f.docKind}.${f.name}`]}
                  level={fieldLevel(f, checks)}
                  onSave={(value) => change(() => patchField(f.id, { value }))}
                  onApprove={() => change(() => patchField(f.id, { status: "approved" }))}
                  onUseAnswer={(value) => change(() => patchField(f.id, { value, status: "approved" }))}
                />
              ))}
            </tbody>
          </table>
        </div>
        <ChecksCard checks={checks} />
      </div>
      {letter && (
        <LetterPanel body={letter.body} model={letter.model} onChange={(body) => setLetter({ ...letter, body })} />
      )}
    </div>
  );
}
