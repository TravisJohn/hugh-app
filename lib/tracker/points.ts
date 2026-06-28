import { type SupabaseClient } from "@supabase/supabase-js";
import { type LearningPoint } from "@/types";

/**
 * Validate an optional learning-point tag for a diary entry.
 *
 * Returns true when `pointId` is null/undefined (an untagged, general entry) or
 * when it matches the id of one of the milestone's learning points. Learning
 * points live in the `milestones.learning_points` JSONB array, so this is a soft
 * reference check rather than a DB foreign key.
 */
export async function isValidPointTag(
  supabase:    SupabaseClient,
  milestoneId: string,
  pointId:     string | null | undefined,
): Promise<boolean> {
  if (pointId == null) return true;
  const { data } = await supabase
    .from("milestones")
    .select("learning_points")
    .eq("id", milestoneId)
    .single();
  const points = (data?.learning_points ?? []) as LearningPoint[];
  return points.some(p => p.id === pointId);
}
