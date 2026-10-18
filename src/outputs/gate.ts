import { runChecks } from "../checks/checks";
import type { Db } from "../db/db";
import { OutputsBlockedError } from "../errors";
import { getCaseDetail, type CaseDetail } from "../repo/cases";

/** The one server-side check both outputs share. Checks re-run live, so fixing a field clears its problem. */
export async function checkOutputGate(
  db: Db,
  caseId: string,
): Promise<{ detail: CaseDetail } | { blocked: OutputsBlockedError } | undefined> {
  const detail = await getCaseDetail(db, caseId);
  if (!detail) return undefined;

  const pending = detail.fields.filter((f) => f.status !== "approved").length;
  const problems = runChecks(detail.fields, detail.documents)
    .filter((c) => c.level === "problem")
    .map((c) => c.id);

  const reasons: string[] = [];
  if (detail.fields.length === 0) reasons.push("the case has no extracted fields");
  if (pending > 0) reasons.push(`${pending} field(s) are not approved yet`);
  if (problems.length > 0) reasons.push(`unresolved problems: ${problems.join(", ")}`);
  if (reasons.length > 0) {
    return { blocked: new OutputsBlockedError({ message: `Outputs are blocked: ${reasons.join("; ")}.`, pending, problems }) };
  }
  return { detail };
}
