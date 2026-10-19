import { CircleCheck, Pencil } from "lucide-react";
import { useState } from "react";
import type { FieldRow } from "../api";
import { cn } from "../lib/cn";
import { Button } from "./Button";

interface Props {
  field: FieldRow;
  answer: string | undefined;
  level: "problem" | "warning" | undefined;
  /** Saves an attorney edit and approves it in the same request. Resolves false when the save failed. */
  onSave: (value: string) => Promise<boolean>;
  onApprove: () => Promise<void>;
  onUseAnswer: (answer: string) => Promise<void>;
  /** Set on rows that just arrived from an upload: they fade in after this many milliseconds. */
  revealDelay?: number;
}

type Busy = "answer" | "document" | "edit" | undefined;

export function FactRow({ field, answer, level, onSave, onApprove, onUseAnswer, revealDelay }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value);
  const [busy, setBusy] = useState<Busy>();
  const approved = field.status === "approved";
  const answerAccepted = approved && answer !== undefined && field.value.trim() === answer.trim();

  // Runs one action at a time, so a second click can't fire while the first is still saving.
  const run = async (which: Exclude<Busy, undefined>, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(which);
    try {
      await fn();
    } finally {
      setBusy(undefined);
    }
  };

  const save = () =>
    run("edit", async () => {
      if (await onSave(draft)) setEditing(false);
    });

  return (
    <tr
      style={revealDelay === undefined ? undefined : { animationDelay: `${revealDelay}ms` }}
      className={cn(
        "align-top [&>td]:break-words",
        revealDelay !== undefined && "fact-in",
        level === "problem" && "bg-red-50 text-red-900",
        level === "warning" && !approved && "bg-amber-50",
        level === "warning" && approved && "shadow-[inset_3px_0_0_rgb(245_158_11)]",
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
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 break-words">{answer}</span>
            {answerAccepted ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-700">
                <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Accepted
              </span>
            ) : (
              <Button
                className="shrink-0 px-3 py-1"
                aria-label={`Accept questionnaire answer for ${field.name}`}
                disabled={busy !== undefined}
                onClick={() => void run("answer", () => onUseAnswer(answer))}
              >
                {busy === "answer" ? "Saving…" : approved ? "Use this instead" : "Accept"}
              </Button>
            )}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              aria-label={`Value for ${field.name}`}
              className="w-full rounded-md border border-slate-300 px-2 py-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" className="px-3 py-1" disabled={busy !== undefined} onClick={() => void save()}>
                {busy === "edit" ? "Saving…" : "Save & accept"}
              </Button>
              <Button className="px-3 py-1" disabled={busy !== undefined} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 break-words">{field.value || <span className="text-slate-400">(missing)</span>}</span>
              <button
                aria-label={`Edit ${field.name}`}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setDraft(field.value);
                  setEditing(true);
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden /> Edit
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
          <div>
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <CircleCheck className="h-4 w-4" aria-hidden /> Approved
            </span>
            {level === "warning" && <div className="mt-1 text-xs text-amber-700">Reviewed with warning</div>}
            {level === "problem" && (
              <div className="mt-1 text-xs text-red-700">Accepted, but the check still fails. Edit the value to fix it.</div>
            )}
          </div>
        ) : (
          <Button
            className="shrink-0"
            aria-label={`Accept document value for ${field.name}`}
            disabled={busy !== undefined}
            onClick={() => void run("document", onApprove)}
          >
            {busy === "document" ? "Saving…" : "Accept"}
          </Button>
        )}
      </td>
    </tr>
  );
}
