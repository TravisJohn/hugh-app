'use client';

import { useState } from 'react';
import { createSession } from '@/app/actions/session';
import type { CoachingMode, Room } from '@/types';
import CoachingToggle from './CoachingToggle';

const PRESETS: Array<{ room: Room; label: string }> = [
  { room: 'data_engineering', label: 'Data Engineering' },
  { room: 'data_science',     label: 'Data Science' },
  { room: 'ml_engineering',   label: 'ML Engineering' },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.28 11.47a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 0 1 1.06-1.06l7.5 7.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function SessionSetupForm() {
  const [selectedRoom,  setSelectedRoom]  = useState<Room | null>(null);
  const [topicText,     setTopicText]     = useState('');
  const [jobAd,         setJobAd]         = useState('');
  const [jobAdOpen,     setJobAdOpen]     = useState(false);
  const [skipIntro,     setSkipIntro]     = useState(false);
  const [voiceEnabled,  setVoiceEnabled]  = useState(true);
  const [coachingMode,  setCoachingMode]  = useState<CoachingMode>('active');
  const [loading,       setLoading]       = useState(false);

  function handlePresetClick(room: Room, label: string) {
    setSelectedRoom(room);
    setTopicText(label);
  }

  function handleTopicChange(text: string) {
    setTopicText(text);
    setSelectedRoom(null);
  }

  const canSubmit = !loading && (selectedRoom !== null || topicText.trim().length > 0 || jobAd.trim().length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);

    const finalRoom  = selectedRoom ?? 'custom';
    // Only store topic for custom sessions; preset rooms use ROOM_CONTEXT server-side.
    // Use || undefined so an empty string becomes undefined → stored as null in DB.
    const finalTopic = finalRoom === 'custom' ? (topicText.trim() || undefined) : undefined;
    const finalJobAd = jobAd.trim() || undefined;

    try {
      await createSession(finalRoom, coachingMode, finalTopic, finalJobAd, skipIntro, voiceEnabled);
      // createSession calls redirect() on success — component will unmount before reaching here
    } catch (err: unknown) {
      // next/navigation redirect() throws internally; Next.js handles it before it reaches here.
      // Any other error (DB failure, auth error) resets the button so the user can retry.
      console.error('[SessionSetupForm] createSession failed:', err);
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-7">

      {/* ── Topic ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Topic
        </p>

        {/* Preset chips */}
        <div className="flex gap-2">
          {PRESETS.map(({ room, label }) => (
            <button
              key={room}
              type="button"
              onClick={() => handlePresetClick(room, label)}
              className={[
                'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                selectedRoom === room
                  ? 'border-[#38BDF8] bg-[#38BDF8]/10 text-[#38BDF8]'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Free-text input — pre-filled from chip click, fully editable */}
        <input
          type="text"
          value={topicText}
          onChange={(e) => handleTopicChange(e.target.value)}
          placeholder="Or type a custom topic…"
          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition-colors focus:border-slate-500 focus:ring-1 focus:ring-slate-500/40"
        />
      </div>

      {/* ── Job description ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setJobAdOpen((o) => !o)}
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-400"
        >
          <ChevronIcon open={jobAdOpen} />
          Paste a job description
          <span className="font-normal normal-case tracking-normal text-slate-600">
            (optional)
          </span>
        </button>

        {jobAdOpen && (
          <textarea
            value={jobAd}
            onChange={(e) => setJobAd(e.target.value)}
            placeholder="Paste the full job description — questions will be tailored to the stack, seniority, and responsibilities…"
            rows={5}
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition-colors focus:border-slate-500 focus:ring-1 focus:ring-slate-500/40"
          />
        )}
      </div>

      {/* ── Options ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5">

        <div className="flex items-start justify-between gap-6">
          {/* Skip intro toggle */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-6">
              <button
                type="button"
                role="switch"
                aria-checked={skipIntro}
                onClick={() => setSkipIntro(!skipIntro)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${skipIntro ? 'bg-sky-400' : 'bg-slate-600'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition duration-200 ease-in-out mt-0.5 ${skipIntro ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
                />
              </button>
              <span className="text-sm text-slate-300">Skip intro question</span>
            </div>
            <p className="pl-[60px] text-xs text-slate-600">
              Jump straight to domain questions
            </p>
          </div>

          {/* Coaching mode */}
          <CoachingToggle value={coachingMode} onChange={setCoachingMode} />
        </div>

        {/* Voice mode toggle */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-6">
            <button
              type="button"
              role="switch"
              aria-checked={voiceEnabled}
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${voiceEnabled ? 'bg-sky-400' : 'bg-slate-600'}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition duration-200 ease-in-out mt-0.5 ${voiceEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
              />
            </button>
            <span className="text-sm text-slate-300">Interviewer audio</span>
          </div>
          <p className="pl-[60px] text-xs text-slate-600">
            Questions and feedback spoken aloud
          </p>
          {voiceEnabled && (
            <p className="pl-[60px] text-xs text-slate-500">
              Adds 1–3s per question for audio generation
            </p>
          )}
        </div>

      </div>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => { void handleSubmit(); }}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-[#38BDF8] py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Starting…' : 'Start Interview'}
      </button>
    </div>
  );
}
