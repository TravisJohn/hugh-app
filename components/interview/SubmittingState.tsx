export default function SubmittingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 flex-1">
      <div className="flex flex-col items-center gap-2">
        <div className="h-3 w-64 rounded bg-[#1E293B] animate-pulse" />
        <div className="h-3 w-40 rounded bg-[#1E293B] animate-pulse" />
      </div>
      <p className="text-sm text-slate-500">Hugh is reviewing your answer…</p>
    </div>
  );
}
