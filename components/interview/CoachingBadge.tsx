'use client';

import type { CoachingMode } from '@/types';

interface Props {
  mode: CoachingMode;
}

export default function CoachingBadge({ mode }: Props) {
  const isActive = mode === 'active';
  return (
    <span
      className={[
        'rounded-full px-2.5 py-0.5 text-xs font-medium',
        isActive
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-amber-500/15 text-amber-400',
      ].join(' ')}
    >
      {isActive ? 'Active coaching' : 'Passive coaching'}
    </span>
  );
}
