"use client";

import ChatWindow from "./ChatWindow";
import ChecklistRail from "./ChecklistRail";

interface Props {
  topic:           string;
  goalId:          string;
  milestoneId?:    string;
  milestoneTitle?: string;
}

/**
 * Ask page layout: chat on the left, the persistent goal checklist on the right.
 * The checklist is a self-assessment the learner ticks off manually — it does
 * not depend on the chat, so the two panes are independent.
 */
export default function AskWorkspace({ topic, goalId, milestoneId, milestoneTitle }: Props) {
  return (
    <div className="relative flex flex-1 min-h-0">
      <ChatWindow
        topic={topic}
        goalId={goalId}
        milestoneId={milestoneId}
      />

      {milestoneId && milestoneTitle && (
        <ChecklistRail
          milestoneId={milestoneId}
          milestoneTitle={milestoneTitle}
        />
      )}
    </div>
  );
}
