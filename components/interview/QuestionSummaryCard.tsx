interface Props {
  index:          number;
  question:       string;
  transcript:     string;
  bestAnswer:     string;
  feedbackText:   string;
  usedBestAnswer: boolean;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}

export default function QuestionSummaryCard({
  index,
  question,
  transcript,
  bestAnswer,
  feedbackText,
  usedBestAnswer,
}: Props) {
  // Split feedback so the first sentence renders bold
  const splitAt = feedbackText.search(/(?<=[.!?])\s/);
  const firstSentence = splitAt > -1 ? feedbackText.slice(0, splitAt) : feedbackText;
  const rest          = splitAt > -1 ? feedbackText.slice(splitAt)    : "";

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-5">
      {/* Card header */}
      <div className="mb-5 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500">Q{index}</span>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
            usedBestAnswer
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-slate-700/60 text-slate-400"
          }`}
        >
          {usedBestAnswer ? "Used ideal answer" : "Own words"}
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <Section label="Question">
          <p className="text-sm italic leading-relaxed text-slate-200">{question}</p>
        </Section>

        <Section label="Your Answer">
          <p className="text-sm leading-relaxed text-slate-300">{transcript}</p>
        </Section>

        <Section label="Ideal Answer">
          <p className="text-sm leading-relaxed text-slate-400">{bestAnswer}</p>
        </Section>

        <Section label="Feedback">
          <p className="text-sm leading-relaxed text-slate-300">
            <span className="font-semibold text-white">{firstSentence}</span>
            {rest}
          </p>
        </Section>
      </div>
    </div>
  );
}
