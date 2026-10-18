import type { Check, FieldRow } from "../api";

const RANK = { problem: 0, warning: 1 } as const;

/** Level of the worst problem or warning that references the field, if any. */
export function fieldLevel(field: FieldRow, checks: readonly Check[]): "problem" | "warning" | undefined {
  let worst: "problem" | "warning" | undefined;
  for (const c of checks) {
    if (c.level === "for_attorney") continue;
    if (!c.fieldRefs.some((r) => r.docKind === field.docKind && r.name === field.name)) continue;
    if (worst === undefined || RANK[c.level] < RANK[worst]) worst = c.level;
  }
  return worst;
}

/** Discrepancy rows first (problems before warnings); otherwise the original order. */
export function sortFacts(fields: readonly FieldRow[], checks: readonly Check[]): FieldRow[] {
  const rank = (f: FieldRow) => {
    const level = fieldLevel(f, checks);
    return level ? RANK[level] : 2;
  };
  return fields
    .map((f, i) => ({ f, i, r: rank(f) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.f);
}
