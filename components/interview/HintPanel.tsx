interface Props {
  hint: string | null;
  isLoading: boolean;
}

export default function HintPanel({ hint, isLoading }: Props) {
  if (!isLoading && !hint) return null;

  return (
    <div className="w-full max-w-2xl">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        Hint
      </p>
      {isLoading ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-5 py-4">
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-700" />
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-5 py-4 border-l-4 border-l-[#38BDF8]">
          <p className="text-sm italic leading-relaxed text-slate-300">{hint}</p>
        </div>
      )}
    </div>
  );
}
