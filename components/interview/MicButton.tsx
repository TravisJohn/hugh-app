interface Props {
  onClick: () => void;
}

export default function MicButton({ onClick }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={onClick}
        aria-label="Start recording"
        className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[#38BDF8] transition-colors hover:bg-sky-300 focus:outline-none focus:ring-4 focus:ring-sky-400/40"
      >
        {/* Glow ring — pulses to draw attention */}
        <span className="absolute inset-0 animate-ping rounded-full bg-[#38BDF8] opacity-25" />

        {/* Microphone icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="relative z-10 h-10 w-10 text-white"
          aria-hidden="true"
        >
          <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
          <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
        </svg>
      </button>
      <span className="text-sm text-slate-400">I&apos;m Ready</span>
    </div>
  );
}
