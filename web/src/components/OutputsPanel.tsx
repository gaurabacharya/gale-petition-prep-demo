import { CircleCheck, Copy, Download, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { generateDataSheet, generateLetter, getLetter, letterPdf, saveLetter } from "../api";
import { downloadBlob } from "../lib/download";
import { Button } from "./Button";

interface Props {
  caseId: string;
  label: string;
  factCount: number;
}

const safeName = (label: string) => label.replace(/[^A-Za-z0-9_-]+/g, "-") || "case";

/** Holds one object URL for a PDF blob and revokes the old one when it changes or the panel closes. */
function usePdfUrl() {
  const [url, setUrl] = useState<string | undefined>();
  const [blob, setBlob] = useState<Blob | undefined>();
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  const set = (b: Blob) => {
    setBlob(b);
    setUrl(URL.createObjectURL(b));
  };
  return { url, blob, set };
}

function PdfPreview({ url, title }: { url: string | undefined; title: string }) {
  return url ? (
    <iframe title={title} src={url} className="h-[520px] w-full rounded-md border border-slate-200 bg-slate-50" />
  ) : (
    <div className="flex h-[520px] items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-400">
      Building preview…
    </div>
  );
}

export function OutputsPanel({ caseId, label, factCount }: Props) {
  const [error, setError] = useState<string | undefined>();
  const [body, setBody] = useState<string | undefined>();
  const [model, setModel] = useState<string>("");
  const [loadingLetter, setLoadingLetter] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [confirmRedraft, setConfirmRedraft] = useState(false);
  const letter = usePdfUrl();
  const sheet = usePdfUrl();
  const firstRender = useRef(true);

  // Load any saved draft and the data sheet once the panel opens.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [saved, sheetBlob] = await Promise.all([getLetter(caseId), generateDataSheet(caseId)]);
        if (!live) return;
        if (saved) {
          setBody(saved.body);
          setModel(saved.model);
        }
        sheet.set(sheetBlob);
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoadingLetter(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [caseId]);

  // After typing stops, save the edit and re-render the letter PDF from exactly this text.
  useEffect(() => {
    if (body === undefined || body.trim() === "") return;
    const first = firstRender.current;
    firstRender.current = false;
    const timer = setTimeout(
      async () => {
        try {
          const [pdf] = await Promise.all([letterPdf(caseId, body), first ? undefined : saveLetter(caseId, body)]);
          letter.set(pdf);
          setError(undefined);
        } catch (e) {
          setError((e as Error).message);
        }
      },
      first ? 0 : 800,
    );
    return () => clearTimeout(timer);
  }, [body, caseId]);

  const draft = async () => {
    // Regenerating throws away edits, so the first click only asks for a second one.
    if (body !== undefined && !confirmRedraft) {
      setConfirmRedraft(true);
      return;
    }
    setConfirmRedraft(false);
    setDrafting(true);
    try {
      const result = await generateLetter(caseId);
      firstRender.current = true;
      setBody(result.body);
      setModel(result.model);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <section aria-label="Ready to file" className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="mb-4 flex items-center gap-2">
        <CircleCheck className="h-5 w-5 text-emerald-700" aria-hidden />
        <h2 className="font-serif text-xl font-semibold text-slate-900">Ready to file</h2>
        <span className="text-sm text-slate-500">All {factCount} facts approved</span>
      </div>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-serif text-lg font-semibold text-slate-900">Support letter</h3>
            {body !== undefined && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void navigator.clipboard?.writeText(body)}>
                  <Copy className="h-4 w-4" aria-hidden /> Copy text
                </Button>
                <Button onClick={() => void draft()} disabled={drafting}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> {drafting ? "Drafting…" : confirmRedraft ? "Replace my edits?" : "Regenerate"}
                </Button>
                <Button
                  variant="primary"
                  aria-label="Download support letter PDF"
                  disabled={!letter.blob}
                  onClick={() => letter.blob && downloadBlob(letter.blob, `support-letter-${safeName(label)}.pdf`)}
                >
                  <Download className="h-4 w-4" aria-hidden /> Download PDF
                </Button>
              </div>
            )}
          </div>
          {loadingLetter ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : body === undefined ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-slate-500">Draft a specialty-occupation support letter from the approved facts.</p>
              <Button variant="primary" onClick={() => void draft()} disabled={drafting}>
                {drafting ? "Drafting…" : "Draft support letter"}
              </Button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-500">
                Drafted by {model}. Edit the text on the left; the PDF updates as you type. Anything in [BRACKETS] was not in
                the documents.
              </p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <textarea
                  aria-label="Support letter text"
                  className="h-[520px] w-full rounded-md border border-slate-300 p-3 font-sans text-sm"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <PdfPreview url={letter.url} title="Support letter preview" />
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-serif text-lg font-semibold text-slate-900">Petition data</h3>
            <Button
              variant="primary"
              aria-label="Download petition data PDF"
              disabled={!sheet.blob}
              onClick={() => sheet.blob && downloadBlob(sheet.blob, `petition-data-${safeName(label)}.pdf`)}
            >
              <Download className="h-4 w-4" aria-hidden /> Download PDF
            </Button>
          </div>
          <p className="mb-2 text-xs text-slate-500">Approved facts grouped by the I-129 and LCA sections they feed.</p>
          <PdfPreview url={sheet.url} title="Petition data preview" />
        </div>
      </div>
    </section>
  );
}
