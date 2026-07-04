import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ goalId: string }>;
}

// The per-goal Learn/Apply/Show hub was removed — the activity is now chosen at
// the top level (/home). Opening a goal goes straight to its Track board. This
// redirect keeps any old links or bookmarks working.
export default async function StudyPage({ params }: Props) {
  const { goalId } = await params;
  redirect(`/study/${goalId}/track`);
}
