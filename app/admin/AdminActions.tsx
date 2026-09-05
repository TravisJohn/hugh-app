"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldOff, ShieldCheck, Crown, Zap, RotateCcw, Loader2, Trash2 } from "lucide-react";

type Action = "approve" | "block" | "unblock" | "set_pro" | "set_free" | "reset_usage";

interface Props {
  userId:    string;
  approved:  boolean;
  isBlocked: boolean;
  isAdmin:   boolean;
  plan:      string;
}

// Declared at module scope (not inside the component) so it isn't re-created on
// every render — re-creating a component remounts it and resets its state.
function Btn({
  action, label, icon: Icon, color, busy, onAct,
}: {
  action: Action;
  label:  string;
  icon:   React.ElementType;
  color:  string;
  busy:   Action | null;
  onAct:  (action: Action) => void;
}) {
  const loading = busy === action;
  return (
    <button
      onClick={() => onAct(action)}
      disabled={!!busy}
      className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${color}`}
    >
      {loading
        ? <Loader2 size={11} className="animate-spin" />
        : <Icon size={11} />
      }
      {label}
    </button>
  );
}

export default function AdminActions({ userId, approved, isBlocked, isAdmin, plan }: Props) {
  const router            = useRouter();
  const [busy, setBusy]   = useState<Action | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        // Never swallowed: an admin has to know the account still exists.
        setError(body.error ?? "That account was not deleted.");
        return;
      }
      router.refresh();
    } catch {
      setError(
        "That account was not deleted. Some of its uploaded files may already " +
        "have been removed — run it again to finish."
      );
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  async function act(action: Action) {
    setBusy(action);
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // Admin rows are read-only
  if (isAdmin) {
    return <span className="text-xs text-slate-600 italic">Admin</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {!approved && !isBlocked && (
        <Btn action="approve" label="Approve" icon={CheckCircle2} busy={busy} onAct={act}
          color="bg-green-500/15 text-green-400 hover:bg-green-500/25" />
      )}
      {!isBlocked ? (
        <Btn action="block" label="Block" icon={ShieldOff} busy={busy} onAct={act}
          color="bg-red-500/10 text-red-400 hover:bg-red-500/20" />
      ) : (
        <Btn action="unblock" label="Unblock" icon={ShieldCheck} busy={busy} onAct={act}
          color="bg-slate-700 text-slate-300 hover:bg-slate-600" />
      )}
      {plan !== "pro" ? (
        <Btn action="set_pro" label="→ Pro" icon={Crown} busy={busy} onAct={act}
          color="bg-amber-500/15 text-amber-400 hover:bg-amber-500/25" />
      ) : (
        <Btn action="set_free" label="→ Free" icon={Zap} busy={busy} onAct={act}
          color="bg-slate-700 text-slate-400 hover:bg-slate-600" />
      )}
      <Btn action="reset_usage" label="Reset" icon={RotateCcw} busy={busy} onAct={act}
        color="bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300" />

      {/* Deletion is separated from the reversible actions above, and asks
          twice, because nothing here can undo it. It is the same routine the
          learner's own settings page calls. */}
      <button
        onClick={confirming ? remove : () => setConfirming(true)}
        disabled={!!busy || deleting}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          confirming
            ? "bg-red-600 text-white hover:bg-red-500"
            : "bg-slate-800 text-slate-600 hover:bg-red-500/15 hover:text-red-400"
        }`}
      >
        {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
        {deleting ? "Deleting…" : confirming ? "Confirm delete" : "Delete"}
      </button>

      {confirming && !deleting && (
        <button
          onClick={() => setConfirming(false)}
          className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      )}

      {error && (
        <span className="w-full text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}
