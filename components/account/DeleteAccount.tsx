"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * The danger zone: irreversible account deletion.
 *
 * The typed-email confirmation is enforced by the API too, not only here — a
 * client-side guard is a courtesy, not a control. What this adds is the pause:
 * typing your own address is slow enough to be a decision.
 *
 * On success the session is bound to a user that no longer exists, so it signs
 * out before navigating; otherwise the next request carries a token for a
 * deleted account and lands on a confusing error rather than the sign-in page.
 */
export default function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const [typed, setTyped]   = useState("");
  const [busy,  setBusy]    = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res  = await fetch("/api/account", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ confirm: typed.trim() }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string };

      if (!res.ok) {
        // Shown, never swallowed: the learner has to know it did NOT happen.
        setError(body.error ?? "Your account was not deleted. Please try again.");
        return;
      }

      await createClient().auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      // Same wording as the API's own failure: a deletion can stop after the
      // files have gone but before the account has, so promising that nothing
      // was removed would be a comfortable lie.
      setError(
        "Your account was not deleted. Some of your uploaded files may already " +
        "have been removed, so it is best to try again and finish — repeating is safe."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-red-400" />
        <h2 className="text-sm font-semibold text-slate-100">Delete your account</h2>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        This removes your account and everything in it — your tracks, milestones and
        diary, your notes and uploaded screenshots, anything you tracked in Monitor
        including uploaded documents, and your usage history. It cannot be undone.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        We keep a de-identified record that a curriculum was generated — how long it
        took, which model, how many milestones. Your topic and the generated content
        are erased from it.
      </p>

      <label className="mt-4 block text-xs text-slate-500">
        Type <span className="font-mono text-slate-300">{email}</span> to confirm
      </label>
      <input
        type="text"
        value={typed}
        onChange={e => setTyped(e.target.value)}
        disabled={busy}
        autoComplete="off"
        className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-red-500/60 disabled:opacity-50"
        placeholder="your email address"
      />

      {error && (
        <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleDelete}
        disabled={!matches || busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? "Deleting…" : "Delete my account permanently"}
      </button>
    </div>
  );
}
