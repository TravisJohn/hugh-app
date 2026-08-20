"use client";

import { useEffect } from "react";

// One line on a surface page records that you used it today.
//
// This is the whole instrumentation seam. An earlier plan hooked the API routes
// instead, which would have recorded *where you spent tokens* rather than
// *where you showed up*: browsing the cloud reference without asking anything,
// or reading Notes without invoking the Coach, hits no route and would have
// vanished. That is the exact failure `activity_events` exists to avoid.
//
// Renders nothing. Fails silently, always — a learning session must never break
// because a usage counter could not be written, and there is nothing the
// learner could do about it if it were shown.

const guardKey = (feature: string, day: string) => `monitor:activity:${feature}:${day}`;

export default function RecordActivity({ feature }: { feature: string }) {
  useEffect(() => {
    // UTC, matching how the server buckets days — a browser just past midnight
    // in a positive offset would otherwise ping again for "tomorrow" and land
    // on the same server row.
    const day = new Date().toISOString().slice(0, 10);
    const key = guardKey(feature, day);

    try {
      // Once per surface per day per browser session. The database is the real
      // guard (one row per user per surface per day); this just avoids a POST
      // on every navigation back to the same page.
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode, or storage disabled. Fall through and ping: a duplicate
      // is an increment, not a problem.
    }

    // No await, no state, nothing rendered. `keepalive` so the request survives
    // a learner who clicks straight through to somewhere else.
    void fetch("/api/monitor/activity", {
      method:    "POST",
      headers:   { "Content-Type": "application/json" },
      body:      JSON.stringify({ feature }),
      keepalive: true,
    }).catch(() => {
      // Deliberately swallowed. See the note at the top: this is one of the few
      // places in Hugh where an error must not surface.
    });
  }, [feature]);

  return null;
}
