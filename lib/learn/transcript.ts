// Builds a downloadable Markdown transcript of an Ask-Hugh session. Pure and
// DOM-free so it's unit-testable; the browser-only Blob/anchor download lives in
// the component. Markdown keeps Hugh's formatting (code fences, lists) intact and
// reads cleanly whether it's used for debugging or a learner's improvement note.

export interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TranscriptMeta {
  topic: string;
  milestoneTitle?: string | null;
  at?: Date;
}

export function buildTranscriptMarkdown(turns: TranscriptTurn[], meta: TranscriptMeta): string {
  const at = meta.at ?? new Date();
  const lines: string[] = [
    "# Ask Hugh — transcript",
    "",
    `**Topic:** ${meta.topic}`,
  ];
  if (meta.milestoneTitle?.trim()) lines.push(`**Focus:** ${meta.milestoneTitle.trim()}`);
  lines.push(`**Exported:** ${at.toISOString()}`, "", "---", "");

  for (const t of turns) {
    lines.push(`### ${t.role === "user" ? "You" : "Hugh"}`, "", t.content.trim(), "");
  }
  return lines.join("\n");
}

// A filesystem-safe, dated filename, e.g. hugh-ask-python-basics-2026-07-07.md
export function transcriptFilename(topic: string, at: Date = new Date()): string {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "session";
  const date = at.toISOString().slice(0, 10);
  return `hugh-ask-${slug}-${date}.md`;
}
