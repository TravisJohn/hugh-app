'use client';

import { useEffect, useState } from 'react';

export default function LandingNotice() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Strip the notice param from the URL without triggering navigation
    const url = new URL(window.location.href);
    url.searchParams.delete('notice');
    window.history.replaceState({}, '', url.toString());

    const t = setTimeout(() => setVisible(false), 7000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="w-full max-w-xl rounded-lg border border-amber-500/30 bg-amber-500/10 px-6 py-4 text-center text-sm text-amber-300"
    >
      Complete at least 5 questions in your next session to unlock your session assessment.
    </div>
  );
}
