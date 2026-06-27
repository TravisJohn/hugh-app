import { type MilestoneCoverage, type PointStatus } from "@/types";

export const POINT_STATUSES: PointStatus[] = ["understood", "bookmarked", "stuck"];

function isPointStatus(val: unknown): val is PointStatus {
  return val === "understood" || val === "bookmarked" || val === "stuck";
}

/**
 * Read-time normalizer for the `coverage` JSONB field. Accepts either the
 * current `{ statuses }` shape or the legacy `{ coveredIds: string[] }` shape
 * and always returns the current shape. Legacy checked ids become "understood",
 * so existing self-assessments survive without a data migration.
 */
export function normalizeCoverage(raw: unknown): MilestoneCoverage | null {
  if (!raw || typeof raw !== "object") return null;
  const obj       = raw as Record<string, unknown>;
  const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : new Date(0).toISOString();

  // Current shape
  if (obj.statuses && typeof obj.statuses === "object" && !Array.isArray(obj.statuses)) {
    const statuses: Record<string, PointStatus> = {};
    for (const [id, val] of Object.entries(obj.statuses as Record<string, unknown>)) {
      if (isPointStatus(val)) statuses[id] = val;
    }
    return { statuses, updatedAt };
  }

  // Legacy shape: every checked id maps to "understood"
  if (Array.isArray(obj.coveredIds)) {
    const statuses: Record<string, PointStatus> = {};
    for (const id of obj.coveredIds) if (typeof id === "string") statuses[id] = "understood";
    return { statuses, updatedAt };
  }

  return null;
}

/** Count how many learning points carry a given status. */
export function countByStatus(statuses: Record<string, PointStatus>, status: PointStatus): number {
  let n = 0;
  for (const s of Object.values(statuses)) if (s === status) n++;
  return n;
}
