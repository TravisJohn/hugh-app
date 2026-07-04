interface Props {
  timeLeft: number;
  total: number;
}

const R = 18;
const CIRC = 2 * Math.PI * R;

/** Circular countdown ring; turns red in the final third of the rung. */
export default function CountdownTimer({ timeLeft, total }: Props) {
  const frac = total > 0 ? Math.max(0, Math.min(1, timeLeft / total)) : 0;
  const low = timeLeft <= total * 0.3;
  const stroke = low ? "#f87171" : "#38bdf8";

  return (
    <div className="relative h-12 w-12">
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={R} fill="none" stroke="#1e293b" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - frac)}
          style={{ transition: "stroke-dashoffset 100ms linear" }}
        />
      </svg>
      <span
        className={`absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums ${
          low ? "text-red-400" : "text-slate-200"
        }`}
      >
        {Math.ceil(timeLeft)}
      </span>
    </div>
  );
}
