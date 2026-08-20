"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronRight, Loader2, PencilLine, Search, Trash2 } from "lucide-react";
import { filterNotes, preview } from "@/lib/margin/notes";
import type { MarginNotesState } from "@/hooks/useMarginNotes";
import type { MarginNote } from "@/types/margin";

// The spine: everything you have written in the margins of Cloud Skills, in one
// place. Capture without review is how a notebook becomes a drawer — a note you
// can never find again is a note you stop bothering to write.
//
// Collapsed to a preview line by default and expanded in place, because the
// question this view answers is "what have I been writing about", and eight full
// notes stacked vertically answer it worse than eight titles do.

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function CloudNotesList({ state }: { state: MarginNotesState }) {
  const { notes, loading, error, remove } = state;
  const [query, setQuery]   = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const shown = useMemo(() => filterNotes(notes, query), [notes, query]);

  if (loading) {
    return (
      <div className="mt-8 flex justify-center text-slate-600">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-4 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {notes.length === 0 ? <Empty /> : (
        <>
          {/* Its own search, not the Browse one: that box filters a catalog and
              resets whenever you switch cloud, which is the wrong behaviour for
              a list of your own writing. */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
            <Search size={14} className="shrink-0 text-slate-600" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search your notes"
              aria-label="Search your notes"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
            />
            <span className="shrink-0 text-xs text-slate-600">
              {shown.length} of {notes.length}
            </span>
          </div>

          {shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {shown.map(n => (
                <NoteCard
                  key={n.id}
                  note={n}
                  open={openId === n.id}
                  onToggle={() => setOpenId(openId === n.id ? null : n.id)}
                  onRemove={() => remove(n.ref_id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NoteCard({ note, open, onToggle, onRemove }: {
  note:     MarginNote;
  open:     boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group rounded-xl border border-slate-800 bg-slate-900/40 transition-colors hover:border-slate-700">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            size={14}
            className={`shrink-0 text-slate-600 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="shrink-0 font-medium text-slate-100">{note.ref_label}</span>
          {!open && (
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
              {preview(note.body)}
            </span>
          )}
        </button>

        <span className="shrink-0 text-[11px] tabular-nums text-slate-600">
          {when(note.updated_at)}
        </span>

        <Link
          href={note.ref_href}
          title={`Open ${note.ref_label}`}
          aria-label={`Open ${note.ref_label}`}
          className="shrink-0 rounded p-1 text-slate-600 transition-colors hover:text-cyan-400"
        >
          <PencilLine size={14} />
        </Link>

        <button
          type="button"
          onClick={onRemove}
          title="Delete this note"
          aria-label={`Delete your note on ${note.ref_label}`}
          className="shrink-0 rounded p-1 text-slate-700 opacity-0 transition-opacity hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-800 px-3 py-3">
          {/* Rendered, not raw: the pad accepts markdown, so reading it back as
              asterisks would make the review half of the feature worse than the
              capture half. */}
          {/* No typography plugin in this project, and raw HTML is off by
              default in react-markdown — so the learner's own markdown renders
              without ever becoming markup. */}
          <div className="space-y-2 text-sm leading-relaxed text-slate-300 [&_a]:text-cyan-400 [&_a]:underline [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_em]:text-slate-400 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-slate-100 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-100 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-200 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-slate-100 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

/** Says what to do, not that there is nothing here. */
function Empty() {
  return (
    <div className="py-16 text-center">
      <p className="text-sm text-slate-400">You haven&rsquo;t written anything yet.</p>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-600">
        Open any service and use the <span className="text-slate-400">Notes</span> tab
        beside it. Whatever you write there collects here, so a page you read once
        is still yours a month later.
      </p>
    </div>
  );
}
