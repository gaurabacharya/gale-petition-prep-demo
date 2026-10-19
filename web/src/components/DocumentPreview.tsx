import { X } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface Props {
  title: string;
  /** Where the file is served from, such as /samples/passport.png. */
  src: string;
  mime: string;
  onClose: () => void;
}

/** Shows a document exactly as it will be uploaded: images inline, PDFs in the browser viewer. */
export function DocumentPreview({ title, src, mime, onClose }: Props) {
  return (
    <Modal label={`Preview of ${title}`} onClose={onClose}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="font-serif text-lg font-semibold text-slate-900">{title}</h3>
        <Button aria-label="Close preview" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden /> Close
        </Button>
      </div>
      <div className="overflow-auto bg-slate-100 p-3">
        {mime.startsWith("image/") ? (
          <img src={src} alt={title} className="mx-auto max-h-[75vh] rounded border border-slate-300 bg-white" />
        ) : (
          <iframe src={src} title={title} className="h-[75vh] w-full rounded border border-slate-300 bg-white" />
        )}
      </div>
    </Modal>
  );
}
