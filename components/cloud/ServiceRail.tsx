"use client";

import { useState } from "react";
import { MessageSquare, PencilLine } from "lucide-react";
import type { CloudProvider } from "@/types/cloud";
import MarginPad from "@/components/margin/MarginPad";
import { useMargin } from "@/components/margin/MarginProvider";
import CloudAssistant from "./CloudAssistant";

// The docked rail beside a service write-up: ask about it, or write about it.
//
// Tabs rather than a third column. At max-w-6xl a third column costs the
// write-up about a third of its width, which would trade away the readability
// of the very thing you came to take notes on.

type Tab = "ask" | "notes";

export default function ServiceRail({
  provider, serviceId, serviceName,
}: {
  provider:    CloudProvider;
  serviceId:   string;
  serviceName: string;
}) {
  const [tab, setTab] = useState<Tab>("ask");
  const { body, focusNonce } = useMargin();

  // A ＋ on a section heading pulls that section into the note — which is
  // useless if the note is behind the other tab, so the rail flips itself.
  //
  // Adjusted during render rather than in an effect: this is React's own
  // "adjust state when an input changes" pattern. In an effect it would render
  // the Ask tab first and then immediately re-render to Notes, which is both a
  // wasted pass and a visible flicker on the tab you are trying to open.
  const [seenNonce, setSeenNonce] = useState(focusNonce);
  if (focusNonce !== seenNonce) {
    setSeenNonce(focusNonce);
    setTab("notes");
  }

  const hasNotes = body.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Service rail"
        className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/40 p-1"
      >
        <RailTab
          active={tab === "ask"}
          onClick={() => setTab("ask")}
          icon={<MessageSquare size={13} />}
          label="Ask"
        />
        <RailTab
          active={tab === "notes"}
          onClick={() => setTab("notes")}
          icon={<PencilLine size={13} />}
          label="Notes"
          // A quiet mark that this service already has something written on it,
          // so the tab is worth opening. Not a count — a margin isn't a score.
          dot={hasNotes}
        />
      </div>

      {/* Both stay mounted. Unmounting the assistant would throw away the
          conversation on a tab flip, and unmounting the pad would force its
          autosave to fire every time you glance at the other tab. */}
      <div className={tab === "ask" ? undefined : "hidden"}>
        <CloudAssistant
          provider={provider}
          serviceId={serviceId}
          serviceName={serviceName}
        />
      </div>
      <div className={tab === "notes" ? undefined : "hidden"}>
        <MarginPad label={serviceName} />
      </div>
    </div>
  );
}

function RailTab({ active, onClick, icon, label, dot = false }: {
  active:  boolean;
  onClick: () => void;
  icon:    React.ReactNode;
  label:   string;
  dot?:    boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {icon}
      {label}
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" aria-hidden />}
    </button>
  );
}
