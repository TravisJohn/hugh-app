"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { useNotes } from "@/hooks/useNotes";
import NotebookTree from "./NotebookTree";
import ImagePanel from "./ImagePanel";
import NoteThread from "./NoteThread";
import NotesPomodoro from "./NotesPomodoro";
import NotesPomodoroProvider from "./NotesPomodoroProvider";

// The Notes workspace: a three-pane, viewport-height layout (tree · screenshots ·
// thread). Each pane scrolls internally — Notes is the one place exempt from the
// app-wide no-scroll rule (see CLAUDE.md), because reviewing long notes needs it.
export default function NotesWorkspace() {
  const n = useNotes();

  // Paste a screenshot straight from the clipboard into the selected note (it
  // becomes a new screenshot with its own thread).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!n.selectedNote) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) { e.preventDefault(); void n.addImage(file); }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [n]);

  return (
    <NotesPomodoroProvider>
      <div className="flex h-screen flex-col bg-[#0A0F1E]">
        {/* Slim top bar */}
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-2.5">
          <Link href="/home" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
            <ArrowLeft size={15} /> Home
          </Link>
          <span className="text-slate-700">/</span>
          <span className="font-serif text-sm font-semibold text-white">Notes</span>
          {n.selectedNote && (
            <span className="truncate text-sm text-slate-500">· {n.selectedNote.title}</span>
          )}
          {/* Notes-only focus timer + music — lives and dies with this workspace. */}
          <div className="ml-auto">
            <NotesPomodoro />
          </div>
        </header>

        {/* Error banner */}
        {n.error && (
          <div className="flex shrink-0 items-center justify-between border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-300">
            <span>{n.error}</span>
            <button type="button" onClick={n.clearError} className="text-red-400 hover:text-red-200">
              <X size={15} />
            </button>
          </div>
        )}

        {/* Three panes */}
        <div className="flex min-h-0 flex-1">
          <NotebookTree
            tree={n.tree}
            selectedNoteId={n.selectedNote?.id ?? null}
            loading={n.loadingTree}
            onSelectNote={n.selectNote}
            onAddNotebook={n.addNotebook}
            onRenameNotebook={n.renameNotebook}
            onRemoveNotebook={n.removeNotebook}
            onAddNote={n.addNote}
            onRenameNote={n.renameNote}
            onRemoveNote={n.removeNote}
          />
          <ImagePanel
            hasNote={!!n.selectedNote}
            images={n.images}
            selectedImageId={n.selectedImageId}
            uploading={n.uploading}
            onSelectImage={n.selectImage}
            onUpload={n.addImage}
            onRenameImage={n.renameImage}
            onRemoveImage={n.removeImage}
          />
          <NoteThread
            key={n.selectedImageId ?? "none"}
            hasImage={!!n.selectedImage}
            imageTitle={n.selectedImage?.title ?? null}
            messages={n.messages}
            summary={n.summary}
            coaching={n.coaching}
            summarizing={n.summarizing}
            loadingThread={n.loadingThread}
            onSaveThought={n.saveThought}
            onCoach={n.runCoach}
            onSummarize={n.runSummary}
          />
        </div>
      </div>
    </NotesPomodoroProvider>
  );
}
