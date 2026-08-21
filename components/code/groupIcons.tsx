import { BarChart3, Braces, Brain, Globe, Snowflake, Sparkles, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { GroupIconKey } from "@/lib/code/groups";

// lib/code/groups.ts is deliberately pure data (it's imported by a server
// component), so it names its icon as a string key rather than importing React
// components. This is where those keys become real icons.
//
// Typed as an exhaustive Record<GroupIconKey, …>: adding a group with a new
// icon key that isn't mapped here is a compile error, not a blank cell.
export const GROUP_ICONS: Record<GroupIconKey, LucideIcon> = {
  braces:   Braces,
  barChart: BarChart3,
  brain:    Brain,
  sparkles: Sparkles,
  workflow: Workflow,
  globe:    Globe,
  snowflake: Snowflake,
};
