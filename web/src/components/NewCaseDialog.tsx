import { useState } from "react";
import { createCase } from "../api";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
  /** Called with the new case id once it is created. */
  onCreated: (id: string) => void;
}

export function NewCaseDialog({ onClose, onCreated }: Props) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      onCreated((await createCase(label.trim())).id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal label="New case" onClose={onClose} maxWidth="max-w-md">
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() && !busy) void submit();
        }}
      >
        <h2 className="font-serif text-xl font-semibold text-slate-900">New case</h2>
        <p className="mt-1 text-sm text-slate-500">Name the petition. You will add its documents next.</p>
        <input
          autoFocus
          aria-label="Case label"
          className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="e.g. Doe H-1B"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!label.trim() || busy}>
            {busy ? "Creating…" : "Create case"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
