import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createCase, listCases, type CaseSummary } from "../api";
import { Button } from "../components/Button";
import { StatusPill } from "../components/StatusPill";

const COLUMNS = [
  "Beneficiary",
  "Case type",
  "Case status",
  "Employer questionnaire",
  "Beneficiary questionnaire",
  "Documents",
  "Discrepancies",
  "Actions",
];

export function ReviewQueue({ filter }: { filter: "all" | "queue" }) {
  const [cases, setCases] = useState<CaseSummary[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [label, setLabel] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    listCases().then(setCases, (e: Error) => setError(e.message));
  }, []);

  const shown = (cases ?? []).filter((c) => filter === "all" || c.status !== "ready");

  const create = async () => {
    const made = await createCase(label.trim());
    navigate(`/case/${made.id}`);
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-slate-900">
            {filter === "all" ? "Cases" : "Attorney Review"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {filter === "all" ? "Every petition in progress." : "Cases waiting for attorney sign-off."} Case type and
            questionnaire columns are demo data.
          </p>
        </div>
        {filter === "all" && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (label.trim()) void create();
            }}
          >
            <input
              aria-label="Case label"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Case label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button variant="primary" type="submit" disabled={!label.trim()}>
              <Plus className="h-4 w-4" aria-hidden /> New case
            </Button>
          </form>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              {COLUMNS.map((c) => (
                <th key={c} className="px-4 py-3 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {shown.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{c.beneficiary ?? c.label}</div>
                  <div className="text-slate-500">{c.employer ?? "No employer yet"}</div>
                </td>
                <td className="px-4 py-3 capitalize">{c.caseType}</td>
                <td className="px-4 py-3">
                  <StatusPill status={c.status} />
                </td>
                <td className="px-4 py-3">{c.employerQuestionnaire}</td>
                <td className="px-4 py-3">{c.beneficiaryQuestionnaire}</td>
                <td className="px-4 py-3">{c.documents} / 3</td>
                <td className="px-4 py-3">{c.discrepancies}</td>
                <td className="px-4 py-3">
                  <Link
                    to={`/case/${c.id}`}
                    className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50"
                  >
                    Review case →
                  </Link>
                </td>
              </tr>
            ))}
            {cases && shown.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-slate-500">
                  No cases to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
