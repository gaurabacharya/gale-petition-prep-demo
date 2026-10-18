import type { Check } from "../../src/checks/checks";
import type { CaseDetail, CaseSummary, FieldRow } from "../../src/repo/cases";

export type { Check, CaseDetail, CaseSummary, FieldRow };
export type DocKind = FieldRow["docKind"];
export interface ChecksResult {
  checks: Check[];
  discrepancies: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const listCases = (): Promise<CaseSummary[]> => request("/cases");
export const createCase = (label: string): Promise<{ id: string; label: string }> =>
  request("/cases", json("POST", { label }));
export const getCase = (id: string): Promise<CaseDetail> => request(`/cases/${id}`);
export const getChecks = (id: string): Promise<ChecksResult> => request(`/cases/${id}/checks`);
export const patchField = (
  id: string,
  patch: { value?: string; status?: "pending" | "approved" },
): Promise<FieldRow> => request(`/fields/${id}`, json("PATCH", patch));
export async function uploadDocument(caseId: string, kind: DocKind, file: File): Promise<void> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);
  await request(`/cases/${caseId}/documents`, { method: "POST", body: form });
}
