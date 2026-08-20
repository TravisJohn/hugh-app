"use client";

import { useState } from "react";
import {
  labelFromFileName, DOC_KIND_LABEL, DOC_ACCEPT, MAX_DOC_BYTES, VERSION_NOTE_MAX,
} from "@/lib/monitor/documents";
import { APP_DOC_MAX } from "@/lib/monitor/applications";
import type { VersionBody } from "@/hooks/useMonitor";
import type { DocumentKind, MonitorDocument } from "@/types/monitor";

// The one form that adds a document or a version, shared by the attach pane and
// the Documents tab. Two copies of a form is how one of them quietly ends up
// with a different size limit or a different idea of what is required.
//
// What is actually required is small and stated: a file OR some text, plus a
// name when the document is new. The "what changed" note is optional and always
// was. When the button is disabled it says why — a dead control that will not
// explain itself is the thing that made this form feel broken.

interface Props {
  kind:         DocumentKind;
  /** Set when adding a version to a document that already exists. */
  existing:     MonitorDocument | null;
  /** Pre-filled name for a new document, where one can be guessed. */
  defaultLabel?: string;
  busy:         boolean;
  onCancel:     () => void;
  onSave:       (label: string, body: VersionBody) => Promise<void>;
}

export default function VersionComposer({
  kind, existing, defaultLabel = "", busy, onCancel, onSave,
}: Props) {
  const [label, setLabel]     = useState(defaultLabel);
  const [file, setFile]       = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [note, setNote]       = useState("");
  const [sizeError, setSize]  = useState<string | null>(null);

  // Exactly one reason at a time, in the order you would hit them.
  const blocker =
    sizeError                                          ? sizeError
    : (!file && content.trim().length === 0)           ? "Attach a file or paste the text."
    : (!existing && label.trim().length === 0)         ? "Give it a name."
    : null;

  function pick(picked: File | null) {
    // Checked here as well as on the server: refusing a 40 MB file after
    // uploading it wastes the upload and the learner's patience.
    if (picked && picked.size > MAX_DOC_BYTES) {
      setSize("That file is larger than 5 MB.");
      setFile(null);
      return;
    }
    setSize(null);
    setFile(picked);
    // The filename is almost always the name you would have typed, so fill it
    // in rather than leaving a required field empty behind a dead button.
    if (picked && !existing && label.trim().length === 0) {
      setLabel(labelFromFileName(picked.name));
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
      <p className="mb-2 text-[11px] font-semibold text-slate-300">
        {existing ? `New version of ${existing.label}` : `New ${DOC_KIND_LABEL[kind].toLowerCase()}`}
      </p>

      {!existing && (
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={kind === "resume" ? "Analytics Engineer CV" : "Cover letter — company"}
          maxLength={120}
          className="mb-2 w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-600"
        />
      )}

      <input
        type="file"
        accept={DOC_ACCEPT}
        onChange={e => pick(e.target.files?.[0] ?? null)}
        className="mb-1 w-full text-[10px] text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-[10px] file:text-slate-300 hover:file:bg-slate-700"
      />
      <p className="mb-2 text-[10px] text-slate-700">
        PDF, DOCX, DOC, RTF or ODT · up to 5 MB · optional if you paste the text
      </p>

      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        maxLength={APP_DOC_MAX}
        rows={5}
        placeholder="Paste the text too — optional, but it makes this searchable."
        className="mb-2 w-full resize-y rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-[10px] leading-relaxed text-slate-300 outline-none placeholder:text-slate-600 focus:border-cyan-600"
      />

      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="What changed in this version? (optional)"
        maxLength={VERSION_NOTE_MAX}
        className="mb-2 w-full rounded border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] text-slate-400 outline-none placeholder:text-slate-700 focus:border-cyan-700"
      />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={blocker !== null || busy}
          onClick={() => void onSave(label.trim(), { content, note, file })}
          className="rounded bg-cyan-500/15 px-2 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
        {/* Says what it wants instead of just refusing. */}
        {blocker && <span className="truncate text-[10px] text-slate-600">{blocker}</span>}
      </div>
    </div>
  );
}
