"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, CheckCircle2, BookOpen, Clock, ChevronRight } from "lucide-react";
import { type TrackWithStats } from "@/types";
import CreateTrackModal from "./CreateTrackModal";

interface Props {
  tracks: TrackWithStats[];
}

export default function TrackerDashboard({ tracks }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {/* Page header */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Progress Tracker</h1>
          <p className="mt-1 text-sm text-slate-400">
            AI-mapped learning paths. Move milestones as you go.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 transition-colors"
        >
          <Plus size={16} />
          New track
        </button>
      </div>

      {/* Empty state */}
      {tracks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800">
            <BookOpen size={24} className="text-slate-500" />
          </div>
          <p className="text-base font-semibold text-slate-300">No tracks yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first track and Claude will build the full curriculum.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-5 flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 transition-colors"
          >
            <Plus size={15} />
            New track
          </button>
        </div>
      )}

      {/* Track grid */}
      {tracks.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map(track => {
            const total    = track.milestones.length;
            const mastered = track.milestones.filter(m => m.kanban_column === "done").length;
            const learning = track.milestones.filter(m => m.kanban_column === "learn").length;
            const pct      = total > 0 ? Math.round((mastered / total) * 100) : 0;

            return (
              <Link
                key={track.id}
                href={`/tracker/${track.id}`}
                className="group flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-800/60 p-5 transition-all hover:border-slate-500 hover:bg-slate-800"
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">
                      {track.topic_description}
                    </p>
                    <h3 className="text-base font-semibold text-slate-100 leading-snug">
                      {track.title}
                    </h3>
                  </div>
                  <ChevronRight
                    size={16}
                    className="mt-0.5 shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors"
                  />
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-green-500" />
                    {mastered}/{total} mastered
                  </span>
                  {learning > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} className="text-sky-500" />
                      {learning} in progress
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-green-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-right text-xs font-mono text-slate-600">{pct}%</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showModal && <CreateTrackModal onClose={() => setShowModal(false)} />}
    </>
  );
}
