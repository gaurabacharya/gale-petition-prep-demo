/** Free-text parsing helpers for the consistency checks. All return undefined rather than throwing. */

export function parseDate(text: string): Date | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const ms = iso ? Date.UTC(+iso[1], +iso[2] - 1, +iso[3]) : /[A-Za-z]/.test(t) ? Date.parse(`${t} UTC`) : NaN;
  return Number.isNaN(ms) ? undefined : new Date(ms);
}

export function parseSalary(text: string): number | undefined {
  const m = /\d[\d,]*(?:\.\d+)?/.exec(text);
  if (!m) return undefined;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^\p{L}\s-]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
}
