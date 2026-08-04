import { extractText as extractPdfText } from "unpdf";
import mammoth from "mammoth";
import { extractHtmlText } from "./extractHtml";
import { ALLOWED_DOCUMENT_MIME, MAX_EXTRACTED_CHARS, type DocumentFormat } from "./limits";

export class UnsupportedDocumentTypeError extends Error {
  constructor(mime: string) {
    super(`Unsupported file type: ${mime}`);
    this.name = "UnsupportedDocumentTypeError";
  }
}

// Thrown when extraction succeeds structurally but yields no usable text —
// the scanned/image-only PDF case (PRD §5). Callers should surface a clear
// rejection, never a silently empty course.
export class EmptyExtractionError extends Error {
  constructor(format: DocumentFormat) {
    super(`No extractable text found in the uploaded ${format.toUpperCase()} file.`);
    this.name = "EmptyExtractionError";
  }
}

export interface ExtractedDocument {
  text:      string;
  format:    DocumentFormat;
  truncated: boolean;
}

async function extractRaw(bytes: Uint8Array, format: DocumentFormat): Promise<string> {
  switch (format) {
    case "pdf": {
      const { text } = await extractPdfText(bytes, { mergePages: true });
      return text;
    }
    case "docx": {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return value;
    }
    case "html": {
      const html = new TextDecoder("utf-8").decode(bytes);
      return extractHtmlText(html);
    }
  }
}

// Dispatches by mime type, normalizes whitespace, guards against
// scanned/image-only documents (no OCR in scope), and caps length before the
// text goes anywhere near a prompt. Mirrors PRD-course-from-document.md §7.3.
export async function extractDocumentText(file: File): Promise<ExtractedDocument> {
  const format = ALLOWED_DOCUMENT_MIME[file.type];
  if (!format) throw new UnsupportedDocumentTypeError(file.type);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw   = await extractRaw(bytes, format);
  const text  = raw.replace(/\r\n/g, "\n").trim();

  if (!text) throw new EmptyExtractionError(format);

  const truncated = text.length > MAX_EXTRACTED_CHARS;
  return {
    text: truncated ? text.slice(0, MAX_EXTRACTED_CHARS) : text,
    format,
    truncated,
  };
}
