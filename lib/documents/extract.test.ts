import { describe, it, expect, vi, beforeEach } from "vitest";

// unpdf/mammoth need real binary fixtures to exercise for real; that's better
// covered by a manual/browser pass once this is wired to a route (per the
// PRD's build sequence). Here we mock the underlying library calls and test
// the module's own logic: dispatch, the empty-extraction guard, and
// truncation. HTML is exercised for real since it's pure string processing.
vi.mock("unpdf", () => ({ extractText: vi.fn() }));
vi.mock("mammoth", () => ({ default: { extractRawText: vi.fn() } }));

import * as unpdf from "unpdf";
import mammoth from "mammoth";
import { extractDocumentText, EmptyExtractionError, UnsupportedDocumentTypeError } from "./extract";
import { MAX_EXTRACTED_CHARS } from "./limits";

const mockExtractText    = unpdf.extractText as unknown as ReturnType<typeof vi.fn>;
const mockExtractRawText = mammoth.extractRawText as unknown as ReturnType<typeof vi.fn>;

function makeFile(content: string, type: string): File {
  return new File([content], "upload", { type });
}

describe("extractDocumentText", () => {
  beforeEach(() => {
    mockExtractText.mockReset();
    mockExtractRawText.mockReset();
  });

  it("rejects unsupported mime types", async () => {
    await expect(extractDocumentText(makeFile("hello", "image/png")))
      .rejects.toThrow(UnsupportedDocumentTypeError);
  });

  it("extracts PDF text via unpdf", async () => {
    mockExtractText.mockResolvedValue({ totalPages: 2, text: "Course content about ETL pipelines." });
    const result = await extractDocumentText(makeFile("%PDF-1.4 fake bytes", "application/pdf"));
    expect(result.format).toBe("pdf");
    expect(result.text).toBe("Course content about ETL pipelines.");
    expect(result.truncated).toBe(false);
  });

  it("extracts DOCX text via mammoth", async () => {
    mockExtractRawText.mockResolvedValue({ value: "Data warehousing fundamentals.", messages: [] });
    const result = await extractDocumentText(makeFile(
      "fake docx bytes",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ));
    expect(result.format).toBe("docx");
    expect(result.text).toBe("Data warehousing fundamentals.");
  });

  it("extracts HTML text directly, stripping markup (no mocking needed)", async () => {
    const result = await extractDocumentText(makeFile("<p>Learn Airflow DAGs</p>", "text/html"));
    expect(result.format).toBe("html");
    expect(result.text).toBe("Learn Airflow DAGs");
  });

  it("throws EmptyExtractionError for a scanned/image-only PDF with no text layer", async () => {
    mockExtractText.mockResolvedValue({ totalPages: 3, text: "   \n\t  " });
    await expect(extractDocumentText(makeFile("%PDF-1.4 fake bytes", "application/pdf")))
      .rejects.toThrow(EmptyExtractionError);
  });

  it("throws EmptyExtractionError for a DOCX with no extractable text", async () => {
    mockExtractRawText.mockResolvedValue({ value: "", messages: [] });
    await expect(extractDocumentText(makeFile(
      "fake docx bytes",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ))).rejects.toThrow(EmptyExtractionError);
  });

  it("truncates text past the character cap and flags it", async () => {
    mockExtractText.mockResolvedValue({ totalPages: 1, text: "x".repeat(MAX_EXTRACTED_CHARS + 10_000) });
    const result = await extractDocumentText(makeFile("%PDF-1.4 fake bytes", "application/pdf"));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(MAX_EXTRACTED_CHARS);
  });
});
