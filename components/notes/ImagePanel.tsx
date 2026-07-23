"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ImagePlus, Trash2, Loader2, ImageOff, Plus } from "lucide-react";
import type { NoteImage, NoteImageFlag } from "@/types";

interface Props {
  hasNote:         boolean;
  images:          NoteImage[];
  selectedImageId: string | null;
  uploading:       boolean;
  onSelectImage:   (id: string) => void;
  onUpload:        (file: File) => void;
  onRenameImage:   (id: string, title: string) => void;
  onFlagImage:     (id: string, flag: NoteImageFlag | null) => void;
  onRemoveImage:   (id: string) => void;
}

const FLAG_ORDER: NoteImageFlag[] = ["red", "yellow", "green"];
const FLAG_DOT: Record<NoteImageFlag, string> = {
  red:    "bg-red-500",
  yellow: "bg-yellow-400",
  green:  "bg-emerald-500",
};
const FLAG_RING: Record<NoteImageFlag, string> = {
  red:    "ring-red-500",
  yellow: "ring-yellow-400",
  green:  "ring-emerald-500",
};
const FLAG_LABEL: Record<NoteImageFlag, string> = {
  red:    "Red — needs more work",
  yellow: "Yellow — getting there",
  green:  "Green — solid",
};

// Three-way red/yellow/green picker: click a dot to set it, click the active
// one again to clear. Purely a manual signal the learner sets for themselves.
function FlagPicker({ value, onChange }: { value: NoteImageFlag | null; onChange: (v: NoteImageFlag | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      {FLAG_ORDER.map((f) => (
        <button
          key={f}
          type="button"
          title={FLAG_LABEL[f]}
          onClick={() => onChange(value === f ? null : f)}
          className={`h-3.5 w-3.5 rounded-full transition-transform hover:scale-110 ${FLAG_DOT[f]}
            ${value === f ? `ring-2 ring-offset-2 ring-offset-[#0A0F1E] ${FLAG_RING[f]}` : "opacity-40 hover:opacity-80"}`}
        />
      ))}
    </div>
  );
}

// Inline-editable screenshot title: double-click to rename, Enter/blur commits,
// Esc cancels. Kept local — its look differs from the tree's labels.
function EditableTitle({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

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
      className="w-56 rounded bg-slate-900 px-1.5 py-0.5 text-sm font-medium text-slate-100 outline-none ring-1 ring-sky-500"
    />
  ) : (
    <span
      onDoubleClick={() => { setDraft(value); setEditing(true); }}
      title="Double-click to rename"
      className="truncate text-sm font-medium text-slate-200"
    >
      {value}
    </span>
  );
}

// Centre pane: the selected screenshot shown large so the learner can read the
// question, with a strip of thumbnails to switch between the note's screenshots.
// Selecting a screenshot here drives the per-screenshot thread in the right pane.
export default function ImagePanel({
  hasNote, images, selectedImageId, uploading,
  onSelectImage, onUpload, onRenameImage, onFlagImage, onRemoveImage,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const selected = images.find((i) => i.id === selectedImageId) ?? images[0] ?? null;

  function pickFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.type.startsWith("image/")) onUpload(f);
    }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pickFiles(e.dataTransfer.files);
  }

  if (!hasNote) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-[#0A0F1E] text-center">
        <div className="max-w-xs px-6">
          <ImageOff size={28} className="mx-auto mb-3 text-slate-700" />
          <p className="text-sm text-slate-500">
            Pick a note on the left, or create one, to drop in a screenshot.
          </p>
        </div>
      </section>
    );
  }

  const hiddenInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      multiple
      className="hidden"
      onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }}
    />
  );

  // ── No screenshots yet → dropzone ─────────────────────────────────────────
  if (images.length === 0) {
    return (
      <section className="flex min-w-0 flex-1 flex-col bg-[#0A0F1E]">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Screenshots</span>
        </header>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`min-h-0 flex-1 p-4 ${dragOver ? "bg-sky-500/5" : ""}`}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`flex h-full min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors
              ${dragOver ? "border-sky-500 text-sky-300" : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400"}`}
          >
            <ImagePlus size={26} />
            <span className="text-sm">Drop a screenshot here, paste it, or click to browse</span>
            <span className="text-xs text-slate-600">PNG, JPEG, WebP or GIF · up to 10 MB</span>
          </button>
        </div>
        {hiddenInput}
      </section>
    );
  }

  // ── Selected screenshot (large) + thumbnail switcher ──────────────────────
  return (
    <section
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`flex min-w-0 flex-1 flex-col bg-[#0A0F1E] ${dragOver ? "bg-sky-500/5" : ""}`}
    >
      {/* Selected screenshot's title + actions */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-2">
        {selected && <EditableTitle value={selected.title} onCommit={(v) => onRenameImage(selected.id, v)} />}
        {selected && (
          <FlagPicker value={selected.flag} onChange={(f) => onFlagImage(selected.id, f)} />
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          Add
        </button>
        {selected && (
          <button
            type="button"
            onClick={() => onRemoveImage(selected.id)}
            title="Delete this screenshot"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={13} /> Delete
          </button>
        )}
      </header>

      {/* Large view of the selected screenshot */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {selected && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selected.url ?? ""}
            alt={selected.title}
            className="mx-auto max-w-full rounded-lg border border-slate-800 shadow-2xl"
          />
        )}
      </div>

      {/* Thumbnail strip: switch between this note's screenshots */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-slate-800 px-3 py-2.5">
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => onSelectImage(img.id)}
            title={img.title}
            className={`group relative aspect-video h-14 shrink-0 overflow-hidden rounded-md border transition-all
              ${img.id === selected?.id ? "border-sky-500 ring-1 ring-sky-500" : "border-slate-800 hover:border-slate-600"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url ?? ""} alt={img.title} className="h-full w-full object-cover" />
            {img.flag && (
              <span
                title={FLAG_LABEL[img.flag]}
                className={`absolute left-0.5 top-0.5 h-2 w-2 rounded-full ring-1 ring-black/40 ${FLAG_DOT[img.flag]}`}
              />
            )}
            <span
              onClick={(e) => { e.stopPropagation(); onRemoveImage(img.id); }}
              title="Delete screenshot"
              className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-slate-300 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
            >
              <Trash2 size={11} />
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="Add a screenshot"
          className="flex aspect-video h-14 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-700 text-slate-500 transition-colors hover:border-sky-600 hover:text-sky-400 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </div>

      {hiddenInput}
    </section>
  );
}
