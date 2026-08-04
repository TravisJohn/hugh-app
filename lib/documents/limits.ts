// Shared between the upload route and the extraction module — kept in one
// place so validation and extraction can't drift out of sync (PRD-course-
// from-document.md §7.3).

export type DocumentFormat = "pdf" | "docx" | "html";

export const ALLOWED_DOCUMENT_MIME: Record<string, DocumentFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/html": "html",
};

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB

// Character cap applied to extracted text before it reaches any prompt, so a
// large source document can't blow the input-token budget of the topic-
// extraction / milestone-generation calls (~4 chars/token — this caps input
// around ~15k tokens of source material). Exact value is a v1 starting point,
// not tuned against real documents yet.
export const MAX_EXTRACTED_CHARS = 60_000;
