import WaveformPlayer from './WaveformPlayer';

interface Props {
  feedback:        string;
  isPlaying:       boolean;
  waveformDataRef: React.MutableRefObject<Uint8Array>;
}

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
  );
}

export default function FeedbackCard({ feedback, isPlaying, waveformDataRef }: Props) {
  const stopIdx       = feedback.search(/[.!?]/);
  const firstSentence = stopIdx >= 0 ? feedback.slice(0, stopIdx + 1) : feedback;
  const rest          = stopIdx >= 0 ? feedback.slice(stopIdx + 1).trim() : '';

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-5">
      <div className="shrink-0">
        <WaveformPlayer waveformDataRef={waveformDataRef} isPlaying={isPlaying} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="leading-relaxed text-slate-200">
          <span className="font-bold">{renderBold(firstSentence)}</span>
          {rest && <> {renderBold(rest)}</>}
        </p>
      </div>
    </div>
  );
}
