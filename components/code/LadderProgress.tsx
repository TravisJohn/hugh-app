interface Props {
  index: number; // 0-based current rung
  total: number;
}

/** "Rung X / N" plus a row of dots showing cleared / current / upcoming. */
export default function LadderProgress({ index, total }: Props) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
        Rung {index + 1}
        <span className="text-slate-600"> / {total}</span>
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i < index
                ? "bg-sky-400"
                : i === index
                  ? "bg-sky-300 ring-2 ring-sky-500/30"
                  : "bg-slate-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
