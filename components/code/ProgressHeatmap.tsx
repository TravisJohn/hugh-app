import CalendarHeatmap from "@/components/ui/CalendarHeatmap";
import type { HeatmapDay } from "@/lib/code/progress";

// The /code/start practice calendar. Now a thin wrapper: the grid, the emerald
// ramp and the week-column padding moved to components/ui/CalendarHeatmap when
// Monitor needed the same thing three more times over.
//
// What stays here is only what is specific to code drills — the wording. A
// cell is a "check", and the summary reads "Practiced on N of the last M days".
export default function ProgressHeatmap({ days }: { days: HeatmapDay[] }) {
  return (
    <CalendarHeatmap
      days={days}
      unit="check"
      activeVerb="Practiced"
      emptyLabel="No practice logged yet — your first check will show up here."
    />
  );
}
