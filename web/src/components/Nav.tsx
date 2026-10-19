import { FileCheck2 } from "lucide-react";
import { useContext, useState } from "react";
import { NavLink } from "react-router-dom";
import { ResetDemoContext } from "../lib/browserDemo";
import { cn } from "../lib/cn";

const link = ({ isActive }: { isActive: boolean }) =>
  cn("text-sm", isActive ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-800");

export function Nav() {
  const reset = useContext(ResetDemoContext);
  const [confirming, setConfirming] = useState(false);
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-[1300px] items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <FileCheck2 className="h-5 w-5" aria-hidden />
            Petition Prep
          </div>
          <nav className="flex items-center gap-6">
            <NavLink to="/" end className={link}>
              Cases
            </NavLink>
            <NavLink to="/queue" className={link}>
              Review queue
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {reset && (
            <button
              className="text-sm text-slate-500 underline hover:text-slate-800"
              onBlur={() => setConfirming(false)}
              onClick={async () => {
                // Deleting every case needs a second click.
                if (!confirming) return setConfirming(true);
                await reset();
                window.location.assign(import.meta.env.BASE_URL);
              }}
            >
              {confirming ? "Delete all cases?" : "Reset demo"}
            </button>
          )}
          <span className="text-sm text-slate-500">Demo attorney</span>
        </div>
      </div>
    </header>
  );
}
