"use client";

import { useState } from "react";
import { pauseSession } from "@/app/actions/session";

export default function BreakButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleBreak() {
    if (loading) return;
    setLoading(true);
    await pauseSession(sessionId);
  }

  return (
    <button
      onClick={handleBreak}
      disabled={loading}
      className="text-sm text-slate-500 transition-colors hover:text-slate-300 disabled:cursor-not-allowed"
    >
      {loading ? "Saving…" : "Take a Break"}
    </button>
  );
}
