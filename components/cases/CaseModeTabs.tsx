import Link from "next/link";
import { LayoutGrid, FlaskConical } from "lucide-react";

/** Tab bar switching between the two case modes: the quick multiple-choice Case
 *  Room (/cases) and the long-form Case Lab (/cases/lab). Rendered at the top of
 *  both landing pages so they read as two tabs of one feature. */
export default function CaseModeTabs({ active }: { active: "room" | "lab" }) {
  const base =
    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors";
  return (
    <div className="mx-auto max-w-6xl px-6 pt-6">
      <div className="inline-flex gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-1">
        <Link
          href="/cases"
          className={`${base} ${
            active === "room"
              ? "bg-sky-500/10 text-sky-400"
              : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <LayoutGrid size={14} />
          Quick cases
        </Link>
        <Link
          href="/cases/lab"
          className={`${base} ${
            active === "lab"
              ? "bg-emerald-500/10 text-emerald-400"
              : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <FlaskConical size={14} />
          The Case Lab
        </Link>
      </div>
    </div>
  );
}
