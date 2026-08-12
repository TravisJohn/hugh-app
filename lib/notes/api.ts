import type {
  Notebook, Note, NoteImage, NoteImageBucket, NoteImageFlag, NoteMessage, NotesTreePayload,
} from "@/types";
import type { TreeKind } from "@/lib/notes/tree";

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
// The tree arrives flat and is nested client-side by lib/notes/tree.ts.
export async function fetchTree(): Promise<NotesTreePayload> {
  return jsonOrThrow<NotesTreePayload>(await fetch("/api/notes/notebooks"));
}

// ── Grouping ─────────────────────────────────────────────────────────────────
// Wrap a Ctrl+click selection in a new folder. Returns the folder so the UI can
// drop straight into rename mode on it.
export async function createGroup(kind: TreeKind, ids: string[]): Promise<Notebook | Note> {
  const { group } = await jsonOrThrow<{ group: Notebook | Note }>(
    await fetch("/api/notes/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ids }),
    }),
  );
  return group;
}

// Tuck a row away into the Bag, or put it back. A folder takes its whole
// subtree with it, so the drawer lists one entry rather than many.
export async function setBagged(kind: TreeKind, id: string, bagged: boolean): Promise<void> {
  const url = kind === "notebook" ? "/api/notes/notebooks" : "/api/notes/notes";
  await jsonOrThrow(
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, bagged }),
    }),
  );
}

// Drop a row into a new slot. `index` is the position as displayed; the server
// resolves it, validates the destination and renumbers the siblings.
export async function moveRow(
  kind: TreeKind,
  id: string,
  parentId: string | null,
  index: number,
  notebookId?: string,
): Promise<void> {
  await jsonOrThrow(
    await fetch("/api/notes/move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, parent_id: parentId, index, notebook_id: notebookId }),
    }),
  );
}

// Remove a folder and lift everything inside it up one level.
export async function dissolveGroup(kind: TreeKind, id: string): Promise<void> {
  await jsonOrThrow(
    await fetch(`/api/notes/group?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  );
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
// A screenshot slot ("bucket") can hold several snips of one tall question, so
// reads come back nested and uploads say which bucket they belong to.
export async function fetchImages(noteId: string): Promise<NoteImageBucket[]> {
  const { images } = await jsonOrThrow<{ images: NoteImageBucket[] }>(
    await fetch(`/api/notes/images?note_id=${encodeURIComponent(noteId)}`),
  );
  return images;
}

// Omit `parentImageId` to start a new bucket; pass one to stack another snip
// inside that bucket.
export async function uploadImage(
  noteId: string, file: File, parentImageId?: string,
): Promise<NoteImage> {
  const form = new FormData();
  form.append("note_id", noteId);
  form.append("file", file);
  if (parentImageId) form.append("parent_image_id", parentImageId);
  const { image } = await jsonOrThrow<{ image: NoteImage }>(
    await fetch("/api/notes/images", { method: "POST", body: form }),
  );
  return image;
}

// Lift a snip to the top of its bucket. The server swaps the image bytes rather
// than the rows, so the bucket keeps its thread.
export async function promoteImage(id: string): Promise<void> {
  await jsonOrThrow(
    await fetch("/api/notes/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, promote: true }),
    }),
  );
}

// Reorder a snip within its bucket (or a bucket within its note).
export async function moveImage(id: string, position: number): Promise<NoteImage> {
  const { image } = await jsonOrThrow<{ image: NoteImage }>(
    await fetch("/api/notes/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, position }),
    }),
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

// Set (or clear, with null) a screenshot's red/yellow/green signal.
export async function setImageFlag(id: string, flag: NoteImageFlag | null): Promise<NoteImage> {
  const { image } = await jsonOrThrow<{ image: NoteImage }>(
    await fetch("/api/notes/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, flag }),
    }),
  );
  return image;
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
