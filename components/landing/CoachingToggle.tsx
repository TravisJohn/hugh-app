'use client';

import type { CoachingMode } from '@/types';

interface Props {
  value:    CoachingMode;
  onChange: (mode: CoachingMode) => void;
}

const OPTIONS: Array<{ mode: CoachingMode; label: string; description: string }> = [
  {
    mode:        'active',
    label:       'Active',
    description: 'Get feedback after every answer',
  },
  {
    mode:        'passive',
    label:       'Passive',
    description: 'Review everything at the end',
  },
];

export default function CoachingToggle({ value, onChange }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex rounded-xl border border-slate-700 bg-[#1E293B] p-1">
        {OPTIONS.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={[
              'rounded-lg px-6 py-2 text-sm font-semibold transition-colors',
              value === mode
                ? 'bg-[#38BDF8] text-slate-900'
                : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {OPTIONS.find((o) => o.mode === value)?.description}
      </p>
    </div>
  );
}
