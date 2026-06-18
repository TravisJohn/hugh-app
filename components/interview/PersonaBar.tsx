'use client';

import Image from "next/image";
import type { ClientPersona, CoachingMode, Room } from "@/types";
import CoachingBadge from "./CoachingBadge";

const ROOM_LABELS: Record<Room, string> = {
  data_engineering: "Data Engineering",
  data_science:     "Data Science",
  ml_engineering:   "ML Engineering",
  custom:           "Custom",
};

interface Props {
  persona:       ClientPersona;
  room:          Room;
  questionIndex: number;
  coachingMode:  CoachingMode;
  topic?:        string;
}

export default function PersonaBar({ persona, room, questionIndex, coachingMode, topic }: Props) {
  const roomLabel = room === 'custom' && topic ? topic : ROOM_LABELS[room];
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-[#0F172A] px-8 py-4">
      {/* Left: avatar + persona info */}
      <div className="flex items-center gap-4">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-700">
          <Image
            src={persona.avatar}
            alt={persona.name}
            fill
            className="object-cover"
            onError={() => undefined}
          />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{persona.name}</p>
          <p className="text-xs text-slate-400">
            {persona.role} &middot; {persona.company}
          </p>
        </div>
      </div>

      {/* Right: room label + coaching badge + question counter */}
      <div className="flex items-center gap-4 text-sm text-slate-400">
        <span className="font-medium text-slate-300">{roomLabel}</span>
        <CoachingBadge mode={coachingMode} />
        <span className="tabular-nums">
          Question{" "}
          <span className="font-semibold text-white">{questionIndex + 1}</span>
        </span>
      </div>
    </div>
  );
}
