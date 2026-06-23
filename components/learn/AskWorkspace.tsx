"use client";

import { useRef } from "react";
import ChatWindow from "./ChatWindow";
import ChecklistRail, { type ChecklistRailHandle } from "./ChecklistRail";

interface Props {
  topic:           string;
  goalId:          string;
  milestoneId?:    string;
  milestoneTitle?: string;
}

/**
 * Ask page layout: chat on the left, the persistent goal checklist on the right.
 * The chat transcript is shared with the rail via a ref so coverage checks can
 * fold in the conversation; the rail recomputes when the learner summarises.
 */
export default function AskWorkspace({ topic, goalId, milestoneId, milestoneTitle }: Props) {
  const transcriptRef = useRef("");
  const railRef       = useRef<ChecklistRailHandle>(null);

  return (
    <div className="relative flex flex-1 min-h-0">
      <ChatWindow
        topic={topic}
        goalId={goalId}
        milestoneId={milestoneId}
        onTranscriptChange={t => { transcriptRef.current = t; }}
        onSummariseStart={() => railRef.current?.recompute()}
      />

      {milestoneId && milestoneTitle && (
        <ChecklistRail
          ref={railRef}
          milestoneId={milestoneId}
          milestoneTitle={milestoneTitle}
          getTranscript={() => transcriptRef.current}
        />
      )}
    </div>
  );
}
