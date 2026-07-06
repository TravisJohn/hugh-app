import { createClient } from "@/lib/supabase/server";
import { verifyUserAccess } from "@/lib/supabase/verify-access";
import CodeLanding, { type Learning } from "@/components/code/CodeLanding";

// The Code pillar landing. "From your learnings" is now wired to the user's real
// tracks/milestones (not sample data): every milestone they've studied becomes a
// practise target. "Create your own" stays a light Socratic flow. Both paths still
// open the sample drill (/code/drill) until the on-demand generator exists.

// Things actually worked on read first; untouched backlog last, newest within each.
const COLUMN_RANK: Record<string, number> = { done: 0, review: 1, learn: 2, backlog: 3 };

type MilestoneRow = { id: string; title: string; kanban_column: string; created_at: string };
type TrackRow = { title: string; milestones: MilestoneRow[] | null };

export default async function CodeStartPage() {
  const supabase = await createClient();
  const { user } = await verifyUserAccess(supabase);

  const { data } = await supabase
    .from("tracks")
    .select("title, milestones!track_id(id, title, kanban_column, created_at)")
    .eq("user_id", user.id);

  const learnings: Learning[] = ((data as TrackRow[] | null) ?? [])
    .flatMap(track =>
      (track.milestones ?? []).map(m => ({
        id: m.id,
        kind: "milestone" as const,
        label: m.title,
        meta: track.title,
        rank: COLUMN_RANK[m.kanban_column] ?? 3,
        createdAt: m.created_at,
      })),
    )
    .sort((a, b) => a.rank - b.rank || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)
    .map(({ rank: _rank, createdAt: _createdAt, ...learning }) => learning);

  return <CodeLanding learnings={learnings} />;
}
