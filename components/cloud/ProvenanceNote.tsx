import { BadgeCheck, CircleHelp, Clock } from "lucide-react";
import {
  describeVerification,
  factCoverage,
  verificationStatus,
  type VerificationStatus,
} from "@/lib/cloud/provenance";
import type { Fact, ServiceMeta } from "@/types/cloud";

// Says out loud when this write-up was last checked, and against what.
//
// Cloud Skills is AI-authored and cloud services move. The dishonest option is
// to say nothing and let 63 write-ups wear the same air of authority; the honest
// one is to state, per service, what has actually been checked. A learner who
// never thought to ask should still leave knowing which numbers were confirmed
// and which were not.
//
// Deliberately quiet — a thin line under the title, not a banner. This is a
// caveat, not a headline, and a warning that shouts on all 63 pages stops being
// read on any of them.

const TONE: Record<VerificationStatus, { icon: React.ReactNode; className: string }> = {
  verified:   { icon: <BadgeCheck size={13} />,  className: "text-emerald-400/80" },
  aging:      { icon: <Clock size={13} />,       className: "text-amber-400/80" },
  stale:      { icon: <Clock size={13} />,       className: "text-amber-400/90" },
  unverified: { icon: <CircleHelp size={13} />,  className: "text-slate-500" },
};

export default function ProvenanceNote({ meta, keyFacts }: {
  meta?:    ServiceMeta;
  keyFacts: readonly Fact[];
}) {
  const status = verificationStatus(meta);
  const tone   = TONE[status];
  const cover  = factCoverage(keyFacts);

  return (
    <p className={`mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${tone.className}`}>
      <span className="flex items-center gap-1.5">
        {tone.icon}
        {describeVerification(meta)}
      </span>

      {/* Coverage sits beside the date because they answer different questions.
          A service checked yesterday where only two of six facts could be
          sourced is not the same as one where all six were, and a single tick
          would overstate the weaker case. */}
      {cover.total > 0 && cover.cited > 0 && (
        <span className="text-slate-600">
          {cover.cited} of {cover.total} key facts carry a citation.
        </span>
      )}
    </p>
  );
}
