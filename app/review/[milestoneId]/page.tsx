import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuizClient from "./QuizClient";

interface Props {
  params:       Promise<{ milestoneId: string }>;
  searchParams: Promise<{ returnUrl?: string }>;
}

export default async function ReviewQuizPage({ params, searchParams }: Props) {
  const { milestoneId } = await params;
  const sp = await searchParams;

  // Sanitise returnUrl to prevent open-redirect
  const returnUrl = sp.returnUrl?.startsWith("/") ? sp.returnUrl : "/";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/review/${milestoneId}`);

  // Verify ownership and fetch milestone
  const { data: milestone } = await supabase
    .from("milestones")
    .select("id, title, kanban_column, review_validated, tracks!inner(user_id)")
    .eq("id", milestoneId)
    .single();

  if (!milestone) notFound();

  // Entry count determines whether quiz is available
  const { count } = await supabase
    .from("milestone_entries")
    .select("id", { count: "exact", head: true })
    .eq("milestone_id", milestoneId);

  return (
    <QuizClient
      milestoneId={milestoneId}
      milestoneTitle={milestone.title}
      entryCount={count ?? 0}
      returnUrl={returnUrl}
    />
  );
}
