interface Props {
  bestAnswer: string;
}

export default function BestAnswerPanel({ bestAnswer }: Props) {
  return (
    <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
        Suggested Approach
      </p>
      {/* Internal scroll so long answers don't push buttons off-screen */}
      <div className="max-h-36 overflow-y-auto">
        <p className="text-sm leading-relaxed text-slate-300">{bestAnswer}</p>
      </div>
    </div>
  );
}
