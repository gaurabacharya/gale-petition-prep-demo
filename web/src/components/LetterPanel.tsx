import { Copy } from "lucide-react";
import { Button } from "./Button";

interface Props {
  body: string;
  model: string;
  onChange: (body: string) => void;
}

export function LetterPanel({ body, model, onChange }: Props) {
  return (
    <section className="mt-6 rounded-lg border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-serif text-xl font-semibold text-slate-900">Support letter draft</h2>
        <Button onClick={() => void navigator.clipboard?.writeText(body)}>
          <Copy className="h-4 w-4" aria-hidden /> Copy
        </Button>
      </div>
      <p className="mb-2 text-sm text-slate-500">
        Drafted by {model}. Edit before use: anything in [BRACKETS] was not in the documents.
      </p>
      <textarea
        aria-label="Support letter draft"
        className="h-96 w-full rounded-md border border-slate-300 p-3 font-sans text-sm"
        value={body}
        onChange={(e) => onChange(e.target.value)}
      />
    </section>
  );
}
