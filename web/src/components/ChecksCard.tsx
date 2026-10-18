import { AlertTriangle, CircleAlert, Scale } from "lucide-react";
import type { Check } from "../api";

const GROUPS = [
  { level: "problem", title: "Problems", Icon: CircleAlert, cls: "text-red-700" },
  { level: "warning", title: "Warnings", Icon: AlertTriangle, cls: "text-amber-700" },
  { level: "for_attorney", title: "For attorney", Icon: Scale, cls: "text-slate-700" },
] as const;

export function ChecksCard({ checks }: { checks: readonly Check[] }) {
  return (
    <aside className="rounded-lg border border-slate-200 p-4">
      <h2 className="mb-3 font-serif text-xl font-semibold text-slate-900">Checks</h2>
      {GROUPS.map(({ level, title, Icon, cls }) => {
        const items = checks.filter((c) => c.level === level);
        if (items.length === 0) return null;
        return (
          <section key={level} className="mb-4 last:mb-0">
            <h3 className={`mb-1 flex items-center gap-1.5 text-sm font-semibold ${cls}`}>
              <Icon className="h-4 w-4" aria-hidden /> {title} ({items.length})
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {items.map((c) => (
                <li key={c.id}>{c.message}</li>
              ))}
            </ul>
          </section>
        );
      })}
      {checks.length === 0 && <p className="text-sm text-slate-500">No checks yet.</p>}
    </aside>
  );
}
