"use client";

import Link, { useLinkStatus } from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

/**
 * The way out of a full-screen activity (quiz, mastery reflection) back to a
 * board — always a real <Link>, never a `router.push()` button.
 *
 * Board routes are dynamic server routes: they await an auth check plus the
 * profile, track and milestone queries before anything can stream. A push
 * button gives no feedback during that round-trip, so the screen sits there
 * unchanged and the control reads as broken. A <Link> prefetches the
 * destination, still navigates if hydration is late or a handler throws, and
 * `useLinkStatus` lets the control show its own spinner the moment it is
 * clicked.
 *
 * `onNavigate` is for synchronous teardown only — stopping audio, clearing a
 * timer, closing a socket. Anything that must *complete* before leaving (a
 * PATCH whose result the destination reads) still belongs in an async handler
 * with `router.push`.
 */
interface Props {
  href:        string;
  label:       string;
  className:   string;
  iconSize?:   number;
  /** false → text only; a spinner still replaces nothing-at-all while pending. */
  showIcon?:   boolean;
  onNavigate?: () => void;
}

export default function ExitLink({
  href, label, className, iconSize = 14, showIcon = true, onNavigate,
}: Props) {
  return (
    <Link href={href} className={className} onClick={onNavigate}>
      <ExitLinkBody label={label} iconSize={iconSize} showIcon={showIcon} />
    </Link>
  );
}

/** Renders inside <Link> — useLinkStatus reports the enclosing link's state. */
function ExitLinkBody({ label, iconSize, showIcon }: {
  label: string; iconSize: number; showIcon: boolean;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      {pending    ? <Loader2   size={iconSize} className="animate-spin" />
       : showIcon ? <ArrowLeft size={iconSize} />
       : null}
      {label}
    </>
  );
}
