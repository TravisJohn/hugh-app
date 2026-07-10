import type { Notebook, Note, NoteImage, NoteMessage, NotebookWithNotes } from "@/types";

// Thin client-side wrappers around the /api/notes/* routes. Kept separate from
// the useNotes hook so the hook is pure state orchestration and these are the
// only place that knows the URL shapes. Every call throws on a non-OK response
// with the server's error message, so the hook can surface it in one place.

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((body.error as string) || "Something went wrong.");
  return body as T;
}

// ── Tree / notebooks ─────────────────────────────────────────────────────────
export async function fetchTree(): Promise<NotebookWithNotes[]> {
  const { tree } = await jsonOrThrow<{ tree: NotebookWithNotes[] }>(await fetch("/api/notes/notebooks"));
  return tree;
}

export async function createNotebook(title?: string): Promise<Notebook> {
  const { notebook } = await jsonOrThrow<{ notebook: Notebook }>(
    await fetch("/api/notes/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
  return notebook;
}

export async function renameNotebook(id: string, title: string): Promise<Notebook> {
  const { notebook } = await jsonOrThrow<{ notebook: Notebook }>(
    await fetch("/api/notes/notebooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    }),
  );
  return notebook;
}

export async function deleteNotebook(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/notes/notebooks?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// ── Notes (leaves) ───────────────────────────────────────────────────────────
export async function createNote(notebookId: string, title?: string): Promise<Note> {
  const { note } = await jsonOrThrow<{ note: Note }>(
    await fetch("/api/notes/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notebook_id: notebookId, title }),
    }),
  );
  return note;
}

export async function renameNote(id: string, title: string): Promise<Note> {
  const { note } = await jsonOrThrow<{ note: Note }>(
    await fetch("/api/notes/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    }),
  );
  return note;
}

export async function deleteNote(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/notes/notes?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// ── Images ───────────────────────────────────────────────────────────────────
export async function fetchImages(noteId: string): Promise<NoteImage[]> {
  const { images } = await jsonOrThrow<{ images: NoteImage[] }>(
    await fetch(`/api/notes/images?note_id=${encodeURIComponent(noteId)}`),
  );
  return images;
}

export async function uploadImage(noteId: string, file: File): Promise<NoteImage> {
  const form = new FormData();
  form.append("note_id", noteId);
  form.append("file", file);
  const { image } = await jsonOrThrow<{ image: NoteImage }>(
    await fetch("/api/notes/images", { method: "POST", body: form }),
  );
  return image;
}

export async function renameImage(id: string, title: string): Promise<NoteImage> {
  const { image } = await jsonOrThrow<{ image: NoteImage }>(
    await fetch("/api/notes/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    }),
  );
  return image;
}

export async function deleteImage(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/notes/images?id=${encodeURIComponent(id)}`, { method: "DELETE" }));
}

// ── Messages / Coach (per screenshot) ─────────────────────────────────────────
export async function fetchMessages(imageId: string): Promise<NoteMessage[]> {
  const { messages } = await jsonOrThrow<{ messages: NoteMessage[] }>(
    await fetch(`/api/notes/messages?image_id=${encodeURIComponent(imageId)}`),
  );
  return messages;
}

export async function postMessage(imageId: string, content: string): Promise<NoteMessage> {
  const { message } = await jsonOrThrow<{ message: NoteMessage }>(
    await fetch("/api/notes/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_id: imageId, content }),
    }),
  );
  return message;
}

export async function coach(imageId: string): Promise<NoteMessage> {
  const { message } = await jsonOrThrow<{ message: NoteMessage }>(
    await fetch("/api/notes/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_id: imageId }),
    }),
  );
  return message;
}

// A running summary of the selected screenshot's thread — transient, not persisted.
export async function summarize(imageId: string): Promise<string> {
  const { summary } = await jsonOrThrow<{ summary: string }>(
    await fetch("/api/notes/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_id: imageId }),
    }),
  );
  return summary;
}
