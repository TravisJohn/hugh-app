'use client';

interface Props {
  questionText: string;
  isLarge: boolean;
}

export default function QuestionZone({ questionText, isLarge }: Props) {
  return (
    <div className="flex-none max-h-[30vh] overflow-y-auto py-6">
      <p
        className={`font-serif italic text-center text-slate-100 transition-all duration-300 ease-out ${
          isLarge ? 'text-2xl leading-relaxed' : 'text-base leading-snug'
        }`}
      >
        &ldquo;{questionText}&rdquo;
      </p>
    </div>
  );
}
