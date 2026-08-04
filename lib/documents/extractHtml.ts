import * as cheerio from "cheerio";

// Strips script/style tags and visually-hidden elements before pulling text.
// This is the concrete, implementable half of the prompt-injection mitigation
// (PRD-course-from-document.md §6, layer 2) — the most common way to hide
// text in an HTML document. Hidden text inside PDF/DOCX isn't caught at
// extraction time at all; that risk is covered by prompt framing instead
// (§6 layer 1), not detection.
export function extractHtmlText(html: string): string {
  const $ = cheerio.load(html);

  $("script, style, noscript, template").remove();
  $("[aria-hidden='true']").remove();
  $("*").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) {
      $(el).remove();
    }
  });

  return $.root()
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
