'use client';

import { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function ActionZone({ children }: Props) {
  return (
    <div className="flex-none h-36 flex items-center justify-center">
      {children}
    </div>
  );
}
