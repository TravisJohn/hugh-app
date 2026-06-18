"use client";

import { useState } from "react";
import { createSession } from "@/app/actions/session";
import type { CoachingMode, Room } from "@/types";
import CoachingToggle from "./CoachingToggle";

// ── Icons ─────────────────────────────────────────────────────────────────

function DataEngineeringIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="text-[#38BDF8]"
    >
      <ellipse
        cx="18" cy="9" rx="13" ry="5"
        stroke="currentColor" strokeWidth="1.8"
      />
      <path
        d="M5 9v9c0 2.8 5.8 5 13 5s13-2.2 13-5V9"
        stroke="currentColor" strokeWidth="1.8"
      />
      <path
        d="M5 18v9c0 2.8 5.8 5 13 5s13-2.2 13-5v-9"
        stroke="currentColor" strokeWidth="1.8"
      />
    </svg>
  );
}

function DataScienceIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="text-[#38BDF8]"
    >
      <polyline
        points="4,28 12,18 20,23 32,8"
        stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="4"  cy="28" r="2.5" fill="currentColor" />
      <circle cx="12" cy="18" r="2.5" fill="currentColor" />
      <circle cx="20" cy="23" r="2.5" fill="currentColor" />
      <circle cx="32" cy="8"  r="2.5" fill="currentColor" />
      <line
        x1="4" y1="32" x2="4"  y2="4"
        stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3"
      />
      <line
        x1="4" y1="32" x2="34" y2="32"
        stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3"
      />
    </svg>
  );
}

function MLEngineeringIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className="text-[#38BDF8]"
    >
      {/* Input nodes */}
      <circle cx="6"  cy="10" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6"  cy="26" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      {/* Hidden nodes */}
      <circle cx="18" cy="6"  r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="18" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="30" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      {/* Output node */}
      <circle cx="30" cy="18" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      {/* Input → hidden edges */}
      <line x1="9.5"  y1="10"  x2="14.5" y2="7"   stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="9.5"  y1="10"  x2="14.5" y2="18"  stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="9.5"  y1="10"  x2="14.5" y2="29"  stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="9.5"  y1="26"  x2="14.5" y2="7"   stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="9.5"  y1="26"  x2="14.5" y2="18"  stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="9.5"  y1="26"  x2="14.5" y2="29"  stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      {/* Hidden → output edges */}
      <line x1="21.5" y1="6"   x2="26.5" y2="17"  stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="21.5" y1="18"  x2="26.5" y2="18"  stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="21.5" y1="30"  x2="26.5" y2="19"  stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.6" />
    </svg>
  );
}

// ── Room config ───────────────────────────────────────────────────────────

const ROOMS: Array<{
  id: Room;
  title: string;
  description: string;
  Icon: () => React.JSX.Element;
}> = [
  {
    id:          "data_engineering",
    title:       "Data Engineering",
    description: "Pipelines, orchestration, data modeling, and infrastructure at scale.",
    Icon:        DataEngineeringIcon,
  },
  {
    id:          "data_science",
    title:       "Data Science",
    description: "Statistics, ML models, experimentation, and insight generation.",
    Icon:        DataScienceIcon,
  },
  {
    id:          "ml_engineering",
    title:       "ML Engineering",
    description: "Model deployment, MLOps, serving infrastructure, and scalability.",
    Icon:        MLEngineeringIcon,
  },
];

// ── Component ─────────────────────────────────────────────────────────────

export default function RoomGrid() {
  const [loading,      setLoading]      = useState<Room | null>(null);
  const [coachingMode, setCoachingMode] = useState<CoachingMode>('active');

  async function handleEnterRoom(room: Room) {
    if (loading) return;
    setLoading(room);
    // createSession redirects on success; error propagates to Next.js error boundary
    await createSession(room, coachingMode);
  }

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8">
      <CoachingToggle value={coachingMode} onChange={setCoachingMode} />
      <div className="grid w-full grid-cols-3 gap-5">
      {ROOMS.map(({ id, title, description, Icon }) => (
        <div
          key={id}
          className="flex flex-col gap-5 rounded-2xl bg-[#1E293B] p-7 transition-colors hover:bg-[#243549]"
        >
          <Icon />

          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <p className="text-sm leading-relaxed text-slate-400">{description}</p>
          </div>

          <button
            onClick={() => handleEnterRoom(id)}
            disabled={loading !== null}
            className="mt-auto w-full rounded-lg bg-[#38BDF8] py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === id ? "Entering…" : "Enter Room"}
          </button>
        </div>
      ))}
      </div>
    </div>
  );
}
