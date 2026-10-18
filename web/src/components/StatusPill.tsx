import type { CaseSummary } from "../api";
import { cn } from "../lib/cn";

const LOOK: Record<CaseSummary["status"], { label: string; cls: string }> = {
  empty: { label: "No documents", cls: "bg-violet-100 text-violet-700" },
  ready: { label: "Ready to file", cls: "bg-violet-100 text-violet-700" },
  needs_review: { label: "Needs review", cls: "bg-amber-100 text-amber-800" },
  discrepancy: { label: "Discrepancy", cls: "bg-red-100 text-red-700" },
};

export function StatusPill({ status }: { status: CaseSummary["status"] }) {
  const { label, cls } = LOOK[status];
  return <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", cls)}>{label}</span>;
}
