"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, FileText, FolderPlus } from "lucide-react";
import type { NotebookWithNotes, Note } from "@/types";

interface Props {
  tree:            NotebookWithNotes[];
  selectedNoteId:  string | null;
  loading:         boolean;
  onSelectNote:    (id: string) => void;
  onAddNotebook:   () => void;
  onRenameNotebook:(id: string, title: string) => void;
  onRemoveNotebook:(id: string) => void;
  onAddNote:       (notebookId: string) => void;
  onRenameNote:    (id: string, title: string) => void;
  onRemoveNote:    (id: string) => void;
}

// Inline-editable label: click to rename, Enter/blur commits, Esc cancels.
function EditableLabel({
  value, onCommit, className,
}: { value: string; onCommit: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function start() { setDraft(value); setEditing(true); }
  function commit() {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) onCommit(v);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setEditing(false); setDraft(value); }
  }

  return editing ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      onClick={(e) => e.stopPropagation()}
      className="w-full rounded bg-slate-900 px-1 py-0.5 text-sm text-slate-100 outline-none ring-1 ring-sky-500"
    />
  ) : (
    <span onDoubleClick={start} title="Double-click to rename" className={className}>
      {value}
    </span>
  );
}

export default function NotebookTree({
  tree, selectedNoteId, loading,
  onSelectNote, onAddNotebook, onRenameNotebook, onRemoveNotebook,
  onAddNote, onRenameNote, onRemoveNote,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-800 bg-[#0B1120]">
      <header className="flex shrink-0 items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Notebooks</span>
        <button
          type="button"
          onClick={onAddNotebook}
          title="New notebook"
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-sky-400"
        >
          <FolderPlus size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {loading && tree.length === 0 ? (
          <p className="px-2 py-4 text-xs text-slate-600">Loading…</p>
        ) : tree.length === 0 ? (
          <button
            type="button"
            onClick={onAddNotebook}
            className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-500 transition-colors hover:border-sky-600 hover:text-sky-400"
          >
            <Plus size={14} /> Create your first notebook
          </button>
        ) : (
          tree.map((nb) => {
            const isOpen = !collapsed.has(nb.id);
            return (
              <div key={nb.id} className="mb-1">
                {/* Notebook row */}
                <div className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-slate-800/60">
                  <button type="button" onClick={() => toggle(nb.id)} className="shrink-0 text-slate-500 hover:text-slate-300">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <EditableLabel
                    value={nb.title}
                    onCommit={(v) => onRenameNotebook(nb.id, v)}
                    className="flex-1 truncate text-sm font-medium text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => onAddNote(nb.id)}
                    title="New note"
                    className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:text-sky-400 group-hover:opacity-100"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Delete "${nb.title}" and all its notes?`)) onRemoveNotebook(nb.id); }}
                    title="Delete notebook"
                    className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Notes */}
                {isOpen && (
                  <div className="ml-4 border-l border-slate-800 pl-1">
                    {nb.notes.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => onAddNote(nb.id)}
                        className="my-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-slate-600 hover:text-sky-400"
                      >
                        <Plus size={12} /> Add a note
                      </button>
                    ) : (
                      nb.notes.map((note) => (
                        <NoteRow
                          key={note.id}
                          note={note}
                          selected={note.id === selectedNoteId}
                          onSelect={() => onSelectNote(note.id)}
                          onRename={(v) => onRenameNote(note.id, v)}
                          onRemove={() => { if (confirm(`Delete "${note.title}"?`)) onRemoveNote(note.id); }}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function NoteRow({
  note, selected, onSelect, onRename, onRemove,
}: {
  note: Note; selected: boolean;
  onSelect: () => void; onRename: (v: string) => void; onRemove: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm
        ${selected ? "bg-sky-600/20 text-sky-200" : "text-slate-300 hover:bg-slate-800/60"}`}
    >
      <FileText size={13} className="shrink-0 text-slate-500" />
      <EditableLabel value={note.title} onCommit={onRename} className="flex-1 truncate" />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Delete note"
        className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
