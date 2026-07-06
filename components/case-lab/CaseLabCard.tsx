import Link from "next/link";
import { Database, Clock, ArrowRight } from "lucide-react";
import type { CaseLabStub } from "@/types/case-lab";

/** One card in the Case Lab feed. Links to the full case page. */
export default function CaseLabCard({ stub }: { stub: CaseLabStub }) {
  return (
    <Link
      href={`/cases/lab/${stub.id}`}
      className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-slate-900/70"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-xs font-medium text-slate-300">
          {stub.facets.topic}
        </span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
          {stub.trap}
        </span>
        <span className="ml-auto text-xs text-slate-600">{stub.releaseDate}</span>
      </div>
      <h3 className="font-serif text-lg font-semibold text-white">{stub.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{stub.blurb}</p>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Database size={12} />
          {stub.rows.toLocaleString()} rows
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />~{stub.estMinutes} min
        </span>
        <span className="ml-auto flex items-center gap-1 text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
          Open <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}
