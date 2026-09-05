"use client";

import Link from "next/link";
import { AlertTriangle, Compass, RotateCw } from "lucide-react";
import { recoveryFor } from "@/lib/errors/recovery";

/**
 * The one failure surface, shared by every `error.tsx` and by `not-found.tsx`.
 *
 * Architecture rule 5: a failure must be distinguishable from a wait, and it
 * needs its own way out. So this screen always states that something *broke*
 * — never "loading", never a bare spinner — and always offers two exits: an
 * action that can actually succeed (see `recoveryFor`), and a real link back
 * to somewhere the learner can carry on from.
 *
 * Rule 4: `h-screen` and centred, so it never scrolls. Deliberately built from
 * the same parts as `/blocked` and `/pending`, because a learner meeting this
 * screen should recognise it as Hugh rather than as a crash.
 */

interface Props {
  title:     string;
  message:   string;
  /** Where "carry on" goes. Always somewhere that works without this screen. */
  homeHref:  string;
  homeLabel: string;
  /** Present on an error boundary, absent on a 404 — there is nothing to retry. */
  error?:    Error & { digest?: string };
  reset?:    () => void;
}

export default function ErrorScreen({
  title, message, homeHref, homeLabel, error, reset,
}: Props) {
  const recovery = error ? recoveryFor(error) : null;

  // A stale chunk cannot be re-rendered out of existence: reset() would ask for
  // the same missing file. Reloading the document is the only exit that works.
  const onAction = recovery?.action === "reload"
    ? () => window.location.reload()
    : reset;

  const actionLabel = recovery?.action === "reload" ? "Reload the page" : "Try again";
  const isMissing   = !error;

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#0F172A] px-6">
      <div className="w-full max-w-md space-y-6 text-center">

        <div className="flex justify-center">
          <div
            className={
              isMissing
                ? "flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-500/10"
                : "flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10"
            }
          >
            {isMissing
              ? <Compass       size={28} className="text-slate-400" />
              : <AlertTriangle size={28} className="text-red-400" />}
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-100">{title}</h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-slate-400">
            {message}
          </p>
        </div>

        {onAction && (
          <button
            type="button"
            onClick={onAction}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition-all hover:bg-sky-400 hover:shadow-sky-400/30"
          >
            <RotateCw size={14} />
            {actionLabel}
          </button>
        )}

        {/* The digest is the only handle on the failure once production has
            redacted the message — worth showing so it can be quoted. */}
        {recovery?.reference && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-4 text-sm leading-relaxed text-slate-500">
            If it keeps happening, quote this reference:{" "}
            <span className="font-mono text-slate-300">{recovery.reference}</span>
          </div>
        )}

        <Link
          href={homeHref}
          className="block text-xs text-slate-700 transition-colors hover:text-slate-500"
        >
          {homeLabel}
        </Link>

      </div>
    </div>
  );
}
