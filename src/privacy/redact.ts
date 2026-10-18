export type RedactionType =
  | "SSN"
  | "A_NUMBER"
  | "EMAIL"
  | "PHONE"
  | "PASSPORT_NO"
  | "DOB"
  | "STUDENT_ID";

export type RedactionCounts = Readonly<Partial<Record<RedactionType, number>>>;

/** Maps tokens back to values. Lives in memory only; hides its contents from JSON and inspect. */
export class Vault {
  readonly #values = new Map<string, string>();
  readonly #tokens = new Map<string, string>();
  readonly #counters = new Map<RedactionType, number>();

  tokenFor(type: RedactionType, value: string): string {
    const key = `${type}\u0000${value}`;
    const existing = this.#tokens.get(key);
    if (existing) return existing;
    const n = (this.#counters.get(type) ?? 0) + 1;
    this.#counters.set(type, n);
    const token = `[[${type}_${n}]]`;
    this.#tokens.set(key, token);
    this.#values.set(token, value);
    return token;
  }

  lookup(token: string): string | undefined {
    return this.#values.get(token);
  }

  toJSON(): string {
    return "[vault]";
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return "[Vault]";
  }
}

interface Rule {
  readonly type: RedactionType;
  readonly pattern: RegExp;
  /** 0 replaces the whole match; 1 replaces only the first capture group, which must end the match. */
  readonly group: 0 | 1;
}

const DATE = String.raw`(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{1,2}[ -][A-Za-z]{3,9}[ -]\d{4}|[A-Za-z]{3,9}\.? \d{1,2}, \d{4})`;

// Order matters: specific shapes first. Labelled rules need a digit in the value so plain words don't match.
// Every repetition is bounded so a long run of letters or spaces cannot make matching quadratic.
const RULES: readonly Rule[] = [
  { type: "SSN", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, group: 0 },
  {
    type: "SSN",
    pattern: /\b(?:ssn|social security(?: number| no\.?)?)[\s:#]{0,8}(\d{9})\b/gi,
    group: 1,
  },
  { type: "A_NUMBER", pattern: /\bA-?\d{3}-?\d{3}-?\d{3}\b/g, group: 0 },
  {
    type: "A_NUMBER",
    pattern: /\bA#\s{0,8}(\d{3}[- ]?\d{3}[- ]?\d{3})\b/g,
    group: 1,
  },
  {
    type: "EMAIL",
    pattern: /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}/g,
    group: 0,
  },
  { type: "PHONE", pattern: /(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, group: 0 },
  { type: "PHONE", pattern: /\+\d{1,3}[\s.-]?(?:\d[\s.-]?){6,12}\d/g, group: 0 },
  {
    type: "PASSPORT_NO",
    pattern: /\bpassport(?:\s{1,8}(?:no\.?|number))?[\s:#]{0,8}((?=[A-Za-z0-9-]{0,11}\d)[A-Za-z0-9-]{6,12})\b/gi,
    group: 1,
  },
  {
    type: "DOB",
    pattern: new RegExp(String.raw`\b(?:date of birth|dob|born(?: on)?)[\s:\-]{0,8}(${DATE})`, "gi"),
    group: 1,
  },
  {
    type: "STUDENT_ID",
    pattern: /\bstudent\s{1,8}(?:id|number|no\.?)[\s:#]{0,8}((?=[A-Za-z0-9-]{0,11}\d)[A-Za-z0-9-]{5,12})\b/gi,
    group: 1,
  },
];

export interface RedactionResult {
  readonly text: string;
  readonly vault: Vault;
  readonly counts: RedactionCounts;
}

export function redact(text: string): RedactionResult {
  const vault = new Vault();
  const counts: Partial<Record<RedactionType, number>> = {};
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (match: string, ...args: unknown[]) => {
      const captured = rule.group === 0 ? match : (args[0] as string);
      counts[rule.type] = (counts[rule.type] ?? 0) + 1;
      return match.slice(0, match.length - captured.length) + vault.tokenFor(rule.type, captured);
    });
  }
  return { text: out, vault, counts };
}

const TOKEN = /\[\[[A-Z_]+_\d+\]\]/g;

export function restore(text: string, vault: Vault): string {
  return text.replace(TOKEN, (token) => vault.lookup(token) ?? token);
}
