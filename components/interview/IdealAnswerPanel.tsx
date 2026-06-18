'use client';

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`h-4 w-4 text-slate-500 transition-transform duration-300 ${collapsed ? '' : 'rotate-90'}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.28 11.47a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 0 1 1.06-1.06l7.5 7.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

interface Props {
  bestAnswer: string;
  isVisible: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function IdealAnswerPanel({
  bestAnswer,
  isVisible,
  isCollapsed,
  onToggleCollapse,
}: Props) {
  if (!isVisible) return null;

  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-slate-700 bg-slate-800/50">
      <button
        onClick={onToggleCollapse}
        className="flex w-full items-center justify-between px-5 py-3 transition-colors hover:bg-slate-700/30"
        aria-expanded={!isCollapsed}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Ideal Answer {isCollapsed ? '▸' : ''}
        </p>
        <ChevronIcon collapsed={isCollapsed} />
      </button>

      {/* max-height transition — content is measured, not display:none */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? 'max-h-0' : 'max-h-64'
        }`}
      >
        <div className="max-h-48 overflow-y-auto px-5 pb-4 scrollbar-thin scrollbar-thumb-[#38BDF8]/40 scrollbar-track-transparent">
          <p className="text-sm leading-relaxed text-slate-300">{bestAnswer}</p>
        </div>
      </div>
    </div>
  );
}
