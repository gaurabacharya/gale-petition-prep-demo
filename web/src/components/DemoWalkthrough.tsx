import { CircleCheck, FileText, Loader2, ShieldCheck } from "lucide-react";
import { useContext, useEffect, useState, type DragEvent } from "react";
import { DEMO_DOCUMENTS } from "../../../src/demo/sampleDocs";
import type { DocKind } from "../api";
import { ModelModeContext } from "../lib/mode";
import { Button } from "./Button";

const TITLES: Record<DocKind, string> = { passport: "Passport", degree: "Degree", offer_letter: "Offer letter" };
const DEMO_TYPE = "application/x-demo-document";

/** What the pipeline does for each kind of document, shown one stage at a time while the upload runs. */
function stagesFor(kind: DocKind, replay: boolean): { label: string; note?: string }[] {
  if (kind === "passport") {
    return [
      { label: "Reading the document text" },
      { label: "Parsing the machine-readable zone locally", note: "Never sent to a model" },
      { label: "Validating the ICAO check digits" },
      { label: "Saving the facts for review" },
    ];
  }
  return [
    { label: "Reading the document text" },
    { label: "Redacting SSN, ID numbers, email and phone", note: "Replaced with tokens before any model call" },
    { label: "Extracting facts with the model", note: replay ? "Recorded Claude answer, replayed" : "Claude via the Anthropic API" },
    { label: "Grading each quote against the document" },
    { label: "Saving the facts for review" },
  ];
}

interface Props {
  uploaded: readonly DocKind[];
  /** Uploads one file and resolves once the new facts are on screen. */
  onUpload: (kind: DocKind, file: File) => Promise<void>;
  /** How long each processing stage stays on screen. */
  stageMs?: number;
}

export function DemoWalkthrough({ uploaded, onUpload, stageMs = 700 }: Props) {
  const replay = useContext(ModelModeContext) === "replay";
  const [busy, setBusy] = useState<DocKind | undefined>();
  const [stage, setStage] = useState(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const nextKind = DEMO_DOCUMENTS.find((d) => !uploaded.includes(d.kind))?.kind;
  const stages = busy ? stagesFor(busy, replay) : [];

  // Walk the stage list while the real upload runs; the last stage waits for the upload to finish.
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, stagesFor(busy, replay).length - 1)), stageMs);
    return () => clearInterval(timer);
  }, [busy, replay, stageMs]);

  const process = async (kind: DocKind, file: File) => {
    if (busy) return;
    setError(undefined);
    setBusy(kind);
    const minimum = new Promise((r) => setTimeout(r, stageMs * (stagesFor(kind, replay).length - 1)));
    try {
      await Promise.all([onUpload(kind, file), minimum]);
      setStage(stagesFor(kind, replay).length);
      await new Promise((r) => setTimeout(r, Math.min(stageMs, 500)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const addSample = (kind: DocKind) => {
    const d = DEMO_DOCUMENTS.find((x) => x.kind === kind)!;
    return process(kind, new File([d.text], d.filename, { type: "text/plain" }));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const kind = e.dataTransfer.getData(DEMO_TYPE) as DocKind;
    if (kind) return void addSample(kind);
    // A real file dragged in from the desktop goes in as the next document still needed.
    const file = e.dataTransfer.files?.[0];
    if (file && nextKind) void process(nextKind, file);
  };

  return (
    <section aria-label="Demo walkthrough" className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <h2 className="font-serif text-xl font-semibold text-slate-900">Demo: add John Doe's documents</h2>
      <p className="mt-1 text-sm text-slate-500">
        Drag each synthetic document onto the drop area, or press Add. Watch it get processed, then its facts appear
        below.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <ul className="space-y-2">
          {DEMO_DOCUMENTS.map((d) => {
            const done = uploaded.includes(d.kind);
            return (
              <li
                key={d.kind}
                draggable={!done && !busy}
                onDragStart={(e) => e.dataTransfer.setData(DEMO_TYPE, d.kind)}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm data-[next=true]:border-slate-900 data-[next=true]:shadow-sm"
                data-next={d.kind === nextKind && !busy}
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" aria-hidden />
                  <span className="font-medium">{TITLES[d.kind]}</span>
                  <span className="text-xs text-slate-400">{d.filename}</span>
                </span>
                {done ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CircleCheck className="h-4 w-4" aria-hidden /> Added
                  </span>
                ) : (
                  <Button aria-label={`Add ${TITLES[d.kind]}`} disabled={!!busy} onClick={() => void addSample(d.kind)}>
                    Add
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        <div
          data-testid="drop-zone"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`min-h-[150px] rounded-md border-2 border-dashed bg-white p-4 text-sm ${over ? "border-slate-900" : "border-slate-300"}`}
        >
          {busy ? (
            <div aria-live="polite">
              <p className="mb-2 font-medium text-slate-900">Processing {TITLES[busy].toLowerCase()}…</p>
              <ol className="space-y-1.5">
                {stages.map((s, i) => (
                  <li key={s.label} className={i > stage ? "text-slate-300" : "text-slate-700"}>
                    <span className="inline-flex items-center gap-2">
                      {i < stage ? (
                        <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                      ) : i === stage ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <span className="h-4 w-4" />
                      )}
                      {s.label}
                    </span>
                    {i <= stage && s.note && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {s.note}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ) : nextKind ? (
            <p className="text-slate-500">Drop the {TITLES[nextKind].toLowerCase()} here.</p>
          ) : (
            <p className="text-emerald-700">All three documents are in. Review each fact and accept it below.</p>
          )}
          {error && <p className="mt-2 text-red-700">{error}</p>}
        </div>
      </div>
    </section>
  );
}
