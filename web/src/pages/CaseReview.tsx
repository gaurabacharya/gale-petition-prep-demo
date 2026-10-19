import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  getCase,
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
import { OutputsPanel } from "../components/OutputsPanel";
import { StatusPill } from "../components/StatusPill";
import { fieldLevel, sortFacts } from "../lib/sortFacts";

const KINDS: DocKind[] = ["passport", "degree", "offer_letter"];

function statusOf(detail: CaseDetail, checks: readonly Check[]): CaseSummary["status"] {
  if (detail.fields.length === 0) return "empty";
  const problems = checks.some((c) => c.level === "problem");
  if (detail.fields.every((f) => f.status === "approved") && !problems && detail.documents.length >= 3) return "ready";
  return problems ? "discrepancy" : "needs_review";
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
  // Row order is fixed while reviewing, so accepting a fact never slides another row under the cursor.
  // It is recomputed only when the set of facts changes (an upload).
  const order = useRef<{ key: string; ids: string[] }>({ key: "", ids: [] });

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

  // Resolves true when the change saved. The row awaits this, so its button stays busy until the refetch lands.
  const change = async (fn: () => Promise<unknown>): Promise<boolean> => {
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
    await refresh();
    return true;
  };

  // Upload for the walkthrough, then fade in just the facts that arrived, one after another.
  const uploadAndReveal = async (kind: DocKind, file: File) => {
    const before = new Set((detail?.fields ?? []).map((f) => f.id));
    await uploadDocument(id, kind, file);
    const d = await refresh();
    const arrived = (d?.fields ?? []).filter((f) => !before.has(f.id));
    setFresh(Object.fromEntries(arrived.map((f, i) => [f.id, i * 120])));
  };

  if (!detail) return <p className="text-sm text-slate-500">{error ?? "Loading…"}</p>;

  const status = statusOf(detail, checks);
  const pending = detail.fields.filter((f) => f.status !== "approved").length;
  const problems = checks.filter((c) => c.level === "problem").length;
  const canGenerate = detail.fields.length > 0 && pending === 0 && problems === 0;
  const key = detail.fields.map((f) => f.id).sort().join(",");
  if (order.current.key !== key) order.current = { key, ids: sortFacts(detail.fields, checks).map((f) => f.id) };
  const rank = new Map(order.current.ids.map((fid, i) => [fid, i]));
  const facts = [...detail.fields].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

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
        {!canGenerate && detail.fields.length > 0 && (
          <p className="shrink-0 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600" data-testid="not-ready">
            Not ready yet:{" "}
            {[
              pending > 0 && `${pending} fact${pending === 1 ? "" : "s"} to accept`,
              problems > 0 && `${problems} problem${problems === 1 ? "" : "s"} to fix`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {canGenerate && <OutputsPanel caseId={id} label={detail.label} factCount={detail.fields.length} />}

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
                  onSave={(value) => change(() => patchField(f.id, { value, status: "approved" }))}
                  onApprove={async () => void (await change(() => patchField(f.id, { status: "approved" })))}
                  onUseAnswer={async (value) => void (await change(() => patchField(f.id, { value, status: "approved" })))}
                />
              ))}
            </tbody>
          </table>
        </div>
        <ChecksCard checks={checks} />
      </div>
    </div>
  );
}
