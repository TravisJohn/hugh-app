// ── Shared summary-document rendering + download (DRY) ──────────────────────
// The mastery "what you learned" summary_doc is rendered in two places — the
// tracker MilestoneDrawer and the Guided Reflection session panel — so the
// markdown component map and the download helper live here as one source of
// truth. Compact styling tuned for dark side-panels; key ideas (h2 / strong)
// are visually emphasised so the summary reads as "highlighted main ideas".

import type { Components } from "react-markdown";

export const summaryMarkdownComponents: Components = {
  h1: ({ children }) => <h1 className="mb-2 text-base font-bold text-slate-100">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-xs font-bold uppercase tracking-widest text-green-400/80">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-slate-200">{children}</h3>,
  p:  ({ children }) => <p className="mb-2 text-sm leading-relaxed text-slate-300">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li className="text-sm leading-snug text-slate-300">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-400">{children}</em>,
  hr: () => <hr className="my-3 border-slate-700/60" />,
};

// Turns a title into a filesystem-friendly slug for the downloaded file name.
export function slugifyTitle(title: string): string {
  return title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

// Triggers a client-side download of the markdown doc as `<slug>-summary.md`.
// No-op on the server or when there's nothing to download.
export function downloadMarkdown(title: string, doc: string): void {
  if (typeof document === "undefined" || !doc) return;
  const slug = slugifyTitle(title);
  const blob = new Blob([doc], { type: "text/markdown;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${slug || "milestone"}-summary.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
