import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  /** Accessible name of the dialog. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Lighter backdrop so the page behind stays visible. */
  light?: boolean;
  maxWidth?: string;
}

/** An overlay dialog. Escape or a click outside closes it; focus moves into it so a nested one can take Escape first. */
export function Modal({ label, onClose, children, light, maxWidth = "max-w-3xl" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus the dialog itself unless a field inside it (autoFocus) already has focus.
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${light ? "bg-slate-900/25" : "bg-slate-900/60"}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`flex max-h-full w-full ${maxWidth} flex-col overflow-hidden rounded-lg bg-white shadow-xl outline-none`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
