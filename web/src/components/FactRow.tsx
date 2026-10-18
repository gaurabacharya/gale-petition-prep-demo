import { CircleCheck } from "lucide-react";
import { useState } from "react";
import type { FieldRow } from "../api";
import { cn } from "../lib/cn";
import { Button } from "./Button";

interface Props {
  field: FieldRow;
  answer: string | undefined;
  level: "problem" | "warning" | undefined;
  onSave: (value: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onUseAnswer: (answer: string) => Promise<void>;
}

export function FactRow({ field, answer, level, onSave, onApprove, onUseAnswer }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value);
  const approved = field.status === "approved";

  return (
    <tr
      className={cn(
        "align-top",
        level === "problem" && "bg-red-50 text-red-900",
        level === "warning" && "bg-amber-50",
      )}
    >
      <td className="px-3 py-3">
        <div className="font-medium" data-testid="fact-name">
          {field.name}
        </div>
        <div className="text-xs text-slate-500">{field.docKind.replace("_", " ")}</div>
      </td>
      <td className="px-3 py-3">
        {answer ? (
          <div className="flex items-center gap-2">
            <span>{answer}</span>
            <Button aria-label={`Accept questionnaire answer for ${field.name}`} onClick={() => void onUseAnswer(answer)}>
              Accept
            </Button>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              aria-label={`Value for ${field.name}`}
              className="w-full rounded-md border border-slate-300 px-2 py-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={async () => {
                await onSave(draft);
                setEditing(false);
              }}
            >
              Save
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <span>{field.value || <span className="text-slate-400">(missing)</span>}</span>
              <button
                aria-label={`Edit ${field.name}`}
                className="text-xs text-slate-500 underline"
                onClick={() => {
                  setDraft(field.value);
                  setEditing(true);
                }}
              >
                Edit
              </button>
            </div>
            {field.quote && <div className="mt-1 text-xs italic text-slate-500">“{field.quote}”</div>}
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">
        <span>{field.source}</span>
        {field.confidence === "low" && <span className="ml-1 text-amber-700">· low confidence</span>}
      </td>
      <td className="px-3 py-3">
        {approved ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <CircleCheck className="h-4 w-4" aria-hidden /> Approved
          </span>
        ) : (
          <Button aria-label={`Accept document value for ${field.name}`} onClick={() => void onApprove()}>
            Accept
          </Button>
        )}
      </td>
    </tr>
  );
}
